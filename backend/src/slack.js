const { App } = require('@slack/bolt');
const { parseRequest } = require('./parser');
const { createPR, mergePR, closePR } = require('./github');
const store = require('./store');

let _seq = Date.now();
function nextId() { return `r_${(_seq++).toString(36)}`; }

// Track pending PRs so Accept/Deny buttons know which PR to act on
// { actionId → { prNumber, requestId, channelId, ts } }
const pendingPRs = new Map();

async function resolveMentions(text, client) {
  const mentions = [...text.matchAll(/<@(\w+)>/g)];
  if (!mentions.length) return { text, mentionedNames: [] };
  const resolved = new Map();
  for (const [, userId] of mentions) {
    if (resolved.has(userId)) continue;
    try {
      const info = await client.users.info({ user: userId });
      resolved.set(userId, info.user?.real_name || userId);
    } catch { resolved.set(userId, userId); }
  }
  return {
    text: text.replace(/<@(\w+)>/g, (_, uid) => resolved.get(uid) || uid),
    mentionedNames: [...resolved.values()],
  };
}

function createSlackApp() {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: !!process.env.SLACK_APP_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
  });

  const TARGET = process.env.SLACK_CHANNEL_ID;

  // ── inbound messages ────────────────────────────────────────────────────────
  app.message(async ({ message, say, client }) => {
    if (message.bot_id || message.subtype) return;
    if (TARGET && message.channel !== TARGET) return;

    console.log(`[slack] message: "${message.text}"`);

    const { text: resolvedText, mentionedNames } = await resolveMentions(message.text, client);

    let requesterName = message.user;
    try {
      const info = await client.users.info({ user: message.user });
      requesterName = info.user?.real_name || message.user;
    } catch { /* ignore */ }

    let parsed;
    try {
      parsed = await parseRequest(resolvedText);
      console.log('[parser]', JSON.stringify(parsed));
    } catch (err) {
      await say({ text: `❌ Parse error: ${err.message}`, thread_ts: message.ts });
      return;
    }

    const assigneeName = parsed.assignee_name || mentionedNames[0] || '(unassigned)';
    const deptId = parsed.team.toLowerCase().replace(/\s+/g, '_');
    const requestId = nextId();

    const request = {
      id: requestId,
      requester_id: message.user,
      assignee_id: assigneeName,
      description: parsed.description,
      direction: 'outbound',
      complexity: parsed.complexity,
      created_at: new Date().toISOString(),
      started_at: null, finished_at: null,
      timestamp: new Date().toISOString(),
      processHours: null,
      status: 'pending',
    };

    store.upsertRequest(deptId, parsed.team, message.user, requesterName, request);

    // Post a preview with Accept / Deny buttons
    const actionId = `pr_${requestId}`;
    await say({
      thread_ts: message.ts,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              `*Logged \`${requestId}\`* → *${parsed.team}*\n` +
              `> ${parsed.description}\n` +
              `Complexity: *${parsed.complexity}/10*   Assignee: *${assigneeName}*`,
          },
        },
        {
          type: 'actions',
          block_id: actionId,
          elements: [
            {
              type: 'button',
              action_id: `accept_${actionId}`,
              text: { type: 'plain_text', text: '✅ Raise GitHub PR', emoji: true },
              style: 'primary',
              value: JSON.stringify({ requestId, description: parsed.description, assigneeName, deptId, team: parsed.team }),
            },
            {
              type: 'button',
              action_id: `deny_${actionId}`,
              text: { type: 'plain_text', text: '❌ Deny', emoji: true },
              style: 'danger',
              value: requestId,
            },
          ],
        },
      ],
    });
  });

  // ── Accept → create PR ──────────────────────────────────────────────────────
  app.action(/^accept_pr_/, async ({ body, action, ack, client }) => {
    await ack();
    const { requestId, description, assigneeName, deptId, team } = JSON.parse(action.value);
    const channelId = body.channel.id;
    const ts = body.message.ts;

    // Replace buttons with "Creating PR…"
    await client.chat.update({
      channel: channelId, ts,
      blocks: [{
        type: 'section',
        text: { type: 'mrkdwn', text: `⏳ Creating GitHub PR for \`${requestId}\`…` },
      }],
    });

    let pr;
    try {
      pr = await createPR(description);
    } catch (err) {
      console.error('[github]', err.message);
      await client.chat.update({
        channel: channelId, ts,
        blocks: [{
          type: 'section',
          text: { type: 'mrkdwn', text: `❌ Failed to create PR: ${err.message}` },
        }],
      });
      return;
    }

    pendingPRs.set(pr.number, { requestId, channelId, ts: body.message.ts });

    await client.chat.update({
      channel: channelId, ts,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              `*PR #${pr.number} opened* — \`${requestId}\`\n` +
              `> ${pr.summary}\n` +
              `<${pr.url}|View on GitHub>`,
          },
        },
        {
          type: 'actions',
          block_id: `merge_${pr.number}`,
          elements: [
            {
              type: 'button',
              action_id: `merge_${pr.number}`,
              text: { type: 'plain_text', text: '✅ Merge PR', emoji: true },
              style: 'primary',
              value: String(pr.number),
            },
            {
              type: 'button',
              action_id: `close_${pr.number}`,
              text: { type: 'plain_text', text: '❌ Close PR', emoji: true },
              style: 'danger',
              value: String(pr.number),
            },
          ],
        },
      ],
    });
  });

  // ── Merge PR ────────────────────────────────────────────────────────────────
  app.action(/^merge_\d+$/, async ({ body, action, ack, client }) => {
    await ack();
    const prNumber = parseInt(action.value);
    const channelId = body.channel.id;
    const ts = body.message.ts;
    try {
      await mergePR(prNumber);
      await client.chat.update({
        channel: channelId, ts,
        blocks: [{
          type: 'section',
          text: { type: 'mrkdwn', text: `✅ PR #${prNumber} merged. Change is live.` },
        }],
      });
    } catch (err) {
      await client.chat.update({
        channel: channelId, ts,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `❌ Merge failed: ${err.message}` } }],
      });
    }
  });

  // ── Deny request ────────────────────────────────────────────────────────────
  app.action(/^deny_pr_/, async ({ body, action, ack, client }) => {
    await ack();
    const channelId = body.channel.id;
    const ts = body.message.ts;
    await client.chat.update({
      channel: channelId, ts,
      blocks: [{
        type: 'section',
        text: { type: 'mrkdwn', text: `❌ Request \`${action.value}\` denied.` },
      }],
    });
  });

  // ── Close PR ─────────────────────────────────────────────────────────────────
  app.action(/^close_\d+$/, async ({ body, action, ack, client }) => {
    await ack();
    const prNumber = parseInt(action.value);
    const channelId = body.channel.id;
    const ts = body.message.ts;
    try {
      await closePR(prNumber);
      await client.chat.update({
        channel: channelId, ts,
        blocks: [{
          type: 'section',
          text: { type: 'mrkdwn', text: `🚫 PR #${prNumber} closed without merging.` },
        }],
      });
    } catch (err) {
      await client.chat.update({
        channel: channelId, ts,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `❌ Close failed: ${err.message}` } }],
      });
    }
  });

  return app;
}

module.exports = { createSlackApp };
