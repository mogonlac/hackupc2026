const { App } = require('@slack/bolt');
const { parseRequest } = require('./parser');
const { createPR, mergePR, closePR } = require('./github');
const { onboardMember } = require('./onboarding');
const store  = require('./store');
const router = require('./router');

let _seq = Date.now();
function nextId() { return `r_${(_seq++).toString(36)}`; }

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtElapsed(fromIso, toIso = new Date().toISOString()) {
  const mins = Math.round((new Date(toIso) - new Date(fromIso)) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ── Block builders ─────────────────────────────────────────────────────────────

function statusLabel(status) {
  const map = { pending: '🟡 Pending', accepted: '🟢 Accepted', in_progress: '🔵 In progress', denied: '🔴 Denied', resolved: '✅ Done', merged: '✅ Merged', sent_back: '↩ Sent back' };
  return map[status] || '🟡 Pending';
}

function outboundBlocks(req, assigneeName, teamName) {
  const time = new Date(req.created_at).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `📤 *\`${req.id}\`*   →   *${teamName}*${assigneeName ? ` / ${assigneeName}` : ' (unassigned)'}\n` +
          `> ${req.description}\n` +
          `Complexity *${req.complexity}/10*   ${statusLabel(req.status)}   _${time}_`,
      },
    },
    {
      type: 'actions',
      block_id: `out_${req.id}`,
      elements: [
        {
          type: 'button',
          action_id: `refresh_${req.id}`,
          text: { type: 'plain_text', text: '🔄 Refresh' },
          value: req.id,
        },
        {
          type: 'button',
          action_id: `bump_${req.id}`,
          text: { type: 'plain_text', text: '📣 Bump' },
          value: JSON.stringify({
            requestId: req.id,
            assigneeSlackId: req._assigneeSlackId || null,
            assigneeName: assigneeName || null,
            teamName,
          }),
        },
      ],
    },
  ];
}

function inboundBlocks(req, requesterName) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `📥 *New request from ${requesterName}*\n` +
          `> ${req.description}\n` +
          `Complexity *${req.complexity}/10*   ID \`${req.id}\``,
      },
    },
    {
      type: 'actions',
      block_id: `in_${req.id}`,
      elements: [
        {
          type: 'button',
          action_id: `accept_${req.id}`,
          text: { type: 'plain_text', text: '✅ Accept' },
          style: 'primary',
          value: req.id,
        },
        {
          type: 'button',
          action_id: `deny_${req.id}`,
          text: { type: 'plain_text', text: '❌ Deny' },
          style: 'danger',
          value: req.id,
        },
        {
          type: 'button',
          action_id: `pr_${req.id}`,
          text: { type: 'plain_text', text: '🔧 Raise PR' },
          value: JSON.stringify({ requestId: req.id, description: req.description }),
        },
      ],
    },
  ];
}

// my-tickets channel card — three states: accepted (Start button), in_progress, resolved/sent_back
function myTicketsBlocks(req, requesterName, state) {
  const acceptedAt  = req.accepted_at  || req.created_at;
  const startedAt   = req.started_at;
  const finishedAt  = req.finished_at;

  let statusLine;
  let elements = [];

  if (state === 'accepted') {
    statusLine = `Accepted at ${fmtTime(acceptedAt)} · waiting to start`;
    elements = [
      {
        type: 'button',
        action_id: `myticket_start_${req.id}`,
        text: { type: 'plain_text', text: '▶ Start' },
        style: 'primary',
        value: JSON.stringify({ requestId: req.id }),
      },
    ];
  } else if (state === 'in_progress') {
    statusLine = `Started ${fmtTime(startedAt)} · ${fmtElapsed(startedAt)} elapsed`;
    elements = [
      {
        type: 'button',
        action_id: `myticket_complete_${req.id}`,
        text: { type: 'plain_text', text: '✅ Complete' },
        style: 'primary',
        value: JSON.stringify({ requestId: req.id }),
      },
      {
        type: 'button',
        action_id: `myticket_sendback_${req.id}`,
        text: { type: 'plain_text', text: '↩ Send back' },
        style: 'danger',
        value: JSON.stringify({ requestId: req.id }),
      },
    ];
  } else if (state === 'resolved') {
    statusLine = `✅ Done in ${fmtElapsed(startedAt, finishedAt)} · finished ${fmtTime(finishedAt)}`;
  } else if (state === 'sent_back') {
    statusLine = `↩ Sent back at ${fmtTime(finishedAt || new Date().toISOString())}`;
  } else {
    statusLine = state;
  }

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `📋 *\`${req.id}\`* — ${req.description}\n` +
          `> From *${requesterName}* · Complexity *${req.complexity}/10*\n` +
          statusLine,
      },
    },
  ];

  if (elements.length) {
    blocks.push({ type: 'actions', block_id: `mt_${req.id}`, elements });
  }

  return blocks;
}

// ── Slack app ──────────────────────────────────────────────────────────────────

// Resolve the onboarding channel by NAME at startup. The env ID is brittle:
// channels can be archived/recreated, renamed, or the bot can be removed —
// any of which leaves the cached ID stale and silently drops every event.
async function resolveOnboardingChannel(client, onboardingChannelIds) {
  const desiredName = (process.env.EMPLOYEE_ONBOARDING_CHANNEL_NAME || 'employee-onboarding')
    .replace(/^#/, '')
    .trim();

  let match = null;
  try {
    let cursor;
    do {
      const res = await client.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: false,
        limit: 1000,
        cursor,
      });
      match = res.channels?.find(c => c.name === desiredName);
      if (match) break;
      cursor = res.response_metadata?.next_cursor;
    } while (cursor);
  } catch (err) {
    console.warn(`[onboarding] conversations.list failed (${err.data?.error || err.message}). Falling back to env id only.`);
    return;
  }

  if (!match) {
    console.warn(`[onboarding] no channel named #${desiredName} found. Onboarding will only fire for the env id, if any.`);
    return;
  }

  onboardingChannelIds.add(match.id);

  const envId = process.env.EMPLOYEE_ONBOARDING_CHANNEL_ID?.trim();
  if (envId && envId !== match.id) {
    console.warn(
      `[onboarding] env EMPLOYEE_ONBOARDING_CHANNEL_ID=${envId} does NOT match live #${desiredName} (${match.id}). ` +
      `Listening on both — please update .env.`,
    );
  } else {
    console.log(`[onboarding] listening on #${desiredName} (${match.id})`);
  }

  if (match.is_archived) {
    console.warn(`[onboarding] #${desiredName} is ARCHIVED — unarchive it for the bot to receive messages.`);
    return;
  }

  if (!match.is_member) {
    if (match.is_private) {
      console.warn(`[onboarding] bot is NOT a member of private #${desiredName} — /invite @your-bot in Slack.`);
    } else {
      try {
        await client.conversations.join({ channel: match.id });
        console.log(`[onboarding] joined #${desiredName}`);
      } catch (err) {
        console.warn(`[onboarding] could not auto-join #${desiredName}: ${err.data?.error || err.message}`);
      }
    }
  }
}

// Walk every channel the registry knows about and verify the bot is still a
// member. If the bot was kicked or the channel was recreated outside the bot,
// `conversations.info` reports is_member:false and we have no way to receive
// messages from it. Log loudly so the user knows to /invite the bot.
async function ensureBotInRegisteredChannels(client) {
  const seen = new Set();
  for (const member of router.getAll()) {
    for (const ch of [member.outboundChannelId, member.inboundChannelId, member.myTicketsChannelId]) {
      if (!ch || seen.has(ch)) continue;
      seen.add(ch);
      try {
        const info = await client.conversations.info({ channel: ch });
        const c = info.channel;
        if (c.is_archived) {
          console.warn(`[router] ${member.name}'s channel #${c.name} (${ch}) is ARCHIVED — bot cannot read it.`);
          continue;
        }
        if (c.is_member) continue;
        if (c.is_private) {
          console.warn(`[router] bot is NOT a member of private #${c.name} (${ch}) for ${member.name} — /invite @your-bot in that channel.`);
        } else {
          try {
            await client.conversations.join({ channel: ch });
            console.log(`[router] re-joined #${c.name} (${ch}) for ${member.name}`);
          } catch (err) {
            console.warn(`[router] could not auto-join #${c.name} for ${member.name}: ${err.data?.error || err.message}`);
          }
        }
      } catch (err) {
        const e = err.data?.error || err.message;
        console.warn(`[router] cannot inspect channel ${ch} for ${member.name}: ${e}` +
          (e === 'channel_not_found' ? ' — channel was deleted; re-onboard this user.' : ''));
      }
    }
  }
}

function createSlackApp() {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: !!process.env.SLACK_APP_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
  });

  // Set so we can accept the env id AND the live id (handles env drift after
  // channel recreate/rename without losing the previous mapping).
  const onboardingChannelIds = new Set();
  const envOnboardingId = process.env.EMPLOYEE_ONBOARDING_CHANNEL_ID?.trim();
  if (envOnboardingId) onboardingChannelIds.add(envOnboardingId);

  // Resolve the live channel id once the socket is connected.
  const originalStart = app.start.bind(app);
  app.start = async (...args) => {
    const result = await originalStart(...args);
    resolveOnboardingChannel(app.client, onboardingChannelIds).catch(err => {
      console.warn(`[onboarding] resolve threw: ${err.message}`);
    });
    ensureBotInRegisteredChannels(app.client).catch(err => {
      console.warn(`[router] channel re-join sweep threw: ${err.message}`);
    });
    return result;
  };

  // Debug: log every raw event received over the socket
  app.use(async ({ payload, next }) => {
    if (payload?.type === 'message' || payload?.type === 'event_callback') {
      console.log(`[debug] type=${payload?.type} sub=${payload?.subtype} ch=${payload?.channel}`);
    }
    await next();
  });

  // ── All messages ─────────────────────────────────────────────────────────────
  app.message(async ({ message: raw, say, client }) => {
    // Drop joins/leaves/file_shares/deletes; allow new + edits.
    if (raw.subtype && raw.subtype !== 'message_changed') return;
    // For edits, the new text lives at message.message.* — flatten so the rest
    // of the handler doesn't need to care.
    const message = raw.subtype === 'message_changed' && raw.message
      ? { ...raw.message, channel: raw.channel }
      : raw;
    if (message.bot_id) return;

    // ── #employee-onboarding ──────────────────────────────────────────────────
    if (onboardingChannelIds.has(message.channel)) {
      const mention = message.text?.match(/<@(\w+)>/);
      if (!mention) {
        await say('Please mention the person to onboard, e.g. `@alice is the new marketing head`');
        return;
      }
      await onboardMember({
        mentionedUserId: mention[1],
        messageText: message.text,
        client,
        say,
      });
      return;
    }

    // ── Personal outbound channel ─────────────────────────────────────────────
    const chInfo = router.getChannelInfo(message.channel);
    if (!chInfo) {
      console.log(`[slack] message in unregistered channel ${message.channel} — ignoring`);
      return;
    }
    if (chInfo.type !== 'outbound') {
      console.log(`[slack] message in ${chInfo.type} channel ${message.channel} — ignoring (only outbound triggers requests)`);
      return;
    }

    const member = router.findBySlackId(chInfo.slackUserId);
    if (!member) {
      console.warn(`[slack] outbound channel ${message.channel} has no member record for slack id ${chInfo.slackUserId}`);
      return;
    }

    console.log(`[slack] outbound from ${member.name} (${chInfo.slackUserId}) in ${message.channel}: "${message.text}"`);

    // Acknowledge immediately with a reaction so the user knows the bot
    // received the message — Gemini can take a few seconds.
    try {
      await client.reactions.add({ channel: message.channel, timestamp: message.ts, name: 'eyes' });
    } catch { /* reaction already added or missing scope — non-fatal */ }

    // Parse with Gemini — retry once on transient errors.
    let parsed;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[gemini] parseRequest attempt ${attempt} for "${message.text}"`);
        const t0 = Date.now();
        parsed = await parseRequest(message.text || '');
        console.log(`[gemini] done in ${Date.now() - t0}ms →`, JSON.stringify(parsed));
        break;
      } catch (err) {
        console.warn(`[gemini] attempt ${attempt} failed: ${err.message}`);
        if (attempt === 2) {
          await client.reactions.remove({ channel: message.channel, timestamp: message.ts, name: 'eyes' }).catch(() => {});
          await client.reactions.add({ channel: message.channel, timestamp: message.ts, name: 'x' }).catch(() => {});
          await say({ text: `❌ Could not parse your request: ${err.message}`, thread_ts: message.ts });
          return;
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // Auto-route to least loaded person in the target team.
    const assignee     = router.route(parsed.team);
    const assigneeName = assignee?.name || null;
    const deptId       = parsed.team.toLowerCase().replace(/\s+/g, '_');
    console.log(`[router] team=${parsed.team} → assignee=${assigneeName || 'unassigned'} (${assignee?.memberId || '-'})`);

    const req = {
      id:              nextId(),
      description:     parsed.description,
      complexity:      parsed.complexity,
      direction:       'outbound',
      status:          'pending',
      created_at:      new Date().toISOString(),
      timestamp:       new Date().toISOString(),
      started_at:      null,
      finished_at:     null,
      processHours:    null,
      requester_id:    member.memberId,
      requester_name:  member.name,
      assignee_id:     assignee?.memberId || 'unassigned',
      _assigneeSlackId: assignee?.slackUserId || null,
    };

    // Store under the assignee's member record (or a sentinel 'unassigned' slot).
    // We deliberately do NOT create a member record for the requester here —
    // that was causing nicholastchakov to appear as a member of Marketing/Operations.
    const storeMemberId   = assignee?.memberId   || 'unassigned';
    const storeMemberName = assigneeName          || 'Unassigned';
    store.upsertRequest(deptId, parsed.team, storeMemberId, storeMemberName, req);
    console.log(`[store] wrote request ${req.id} → dept=${deptId} member=${storeMemberId}`);

    // Replace 👀 with ✅ to show the ticket was created.
    await client.reactions.remove({ channel: message.channel, timestamp: message.ts, name: 'eyes' }).catch(() => {});
    await client.reactions.add({ channel: message.channel, timestamp: message.ts, name: 'white_check_mark' }).catch(() => {});

    // Post ticket card in the outbound channel.
    try {
      await say({
        thread_ts: message.ts,
        text: assigneeName
          ? `✅ Routed to *${assigneeName}* (${parsed.team})`
          : `✅ Logged for *${parsed.team}* — no one registered yet`,
        blocks: outboundBlocks(req, assigneeName, parsed.team),
      });
      console.log(`[slack] ticket card posted in outbound channel`);
    } catch (err) {
      console.error(`[slack] failed to post ticket card: ${err.message}`);
    }

    // Post to assignee's inbound channel.
    if (assignee?.inboundChannelId) {
      try {
        await client.chat.postMessage({
          channel: assignee.inboundChannelId,
          text: `New request from ${member.name}`,
          blocks: inboundBlocks(req, member.name),
        });
        console.log(`[slack] inbound card posted to ${assignee.inboundChannelId} for ${assigneeName}`);
      } catch (err) {
        console.warn(`[slack] could not post to inbound channel ${assignee.inboundChannelId}: ${err.message}`);
      }
    } else {
      console.log(`[slack] no inbound channel for assignee — skipping inbound card`);
    }
  });

  // ── Refresh ───────────────────────────────────────────────────────────────────
  app.action(/^refresh_/, async ({ body, action, ack, client }) => {
    await ack();
    const requestId = action.value;
    const snap = store.getSnapshot();
    let found = null, teamName = '';
    for (const dept of snap.departments) {
      for (const mem of dept.members) {
        const r = mem.requests.find(r => r.id === requestId);
        if (r) { found = r; teamName = dept.name; break; }
      }
      if (found) break;
    }
    if (!found) return;

    const assignee = found.assignee_id !== 'unassigned'
      ? router.findByMemberId(found.assignee_id)
      : null;

    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      blocks: outboundBlocks(found, assignee?.name || null, teamName),
    });
  });

  // ── Bump ──────────────────────────────────────────────────────────────────────
  app.action(/^bump_/, async ({ body, action, ack, client }) => {
    await ack();
    const { requestId, assigneeSlackId, assigneeName, teamName } = JSON.parse(action.value);
    const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    // Post a nudge in assignee's inbound channel
    const assigneeMember = assigneeSlackId ? router.findBySlackId(assigneeSlackId) : null;
    if (assigneeMember?.inboundChannelId) {
      try {
        await client.chat.postMessage({
          channel: assigneeMember.inboundChannelId,
          text: `📣 Bump on \`${requestId}\` — still waiting on this one (${now}).`,
        });
      } catch (err) {
        console.warn('[slack] could not bump:', err.message);
      }
    }

    // Update ticket card to show the bump
    const existingBlocks = body.message.blocks || [];
    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      blocks: [
        existingBlocks[0],
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `📣 Bumped *${assigneeName || teamName}* at ${now}` }],
        },
        existingBlocks[existingBlocks.length - 1],
      ].filter(Boolean),
    });
  });

  // ── Accept ────────────────────────────────────────────────────────────────────
  app.action(/^accept_/, async ({ body, action, ack, client }) => {
    await ack();
    const requestId   = action.value;
    const acceptedAt  = new Date().toISOString();
    const assigneeSlackId = body.user.id;

    // Mark accepted in store.
    const req = store.updateRequest(requestId, { status: 'accepted', accepted_at: acceptedAt });

    // Update the inbound card to a simple confirmation.
    await client.chat.update({
      channel: body.channel.id, ts: body.message.ts,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `✅ *Accepted* \`${requestId}\` — check your my-tickets channel.` } }],
    });

    // Post a Start card in the assignee's my-tickets channel.
    const assignee = router.findBySlackId(assigneeSlackId);
    if (!assignee?.myTicketsChannelId) {
      console.warn(`[slack] accept: no my-tickets channel for ${assigneeSlackId}`);
      return;
    }

    const requesterName = req?.requester_name || 'someone';
    try {
      const posted = await client.chat.postMessage({
        channel: assignee.myTicketsChannelId,
        text: `New ticket \`${requestId}\` — ${req?.description || ''}`,
        blocks: myTicketsBlocks(req || { id: requestId, description: '', complexity: 5, accepted_at: acceptedAt }, requesterName, 'accepted'),
      });
      // Store the message timestamp so we can update the card on Start/Complete.
      store.updateRequest(requestId, { _myTicketsMsgTs: posted.ts, _myTicketsChannel: assignee.myTicketsChannelId });
      console.log(`[slack] my-tickets card posted for ${requestId} in ${assignee.myTicketsChannelId}`);
    } catch (err) {
      console.warn(`[slack] could not post my-tickets card: ${err.message}`);
    }
  });

  // ── Deny ──────────────────────────────────────────────────────────────────────
  app.action(/^deny_/, async ({ body, action, ack, client }) => {
    await ack();
    store.updateRequest(action.value, { status: 'denied' });
    await client.chat.update({
      channel: body.channel.id, ts: body.message.ts,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `❌ *Declined* \`${action.value}\`` } }],
    });
  });

  // ── Start (my-tickets) ────────────────────────────────────────────────────────
  app.action(/^myticket_start_/, async ({ body, action, ack, client }) => {
    await ack();
    const { requestId } = JSON.parse(action.value);
    const startedAt = new Date().toISOString();

    const req = store.updateRequest(requestId, { status: 'in_progress', started_at: startedAt });
    if (!req) { console.warn(`[slack] start: request ${requestId} not found`); return; }

    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      blocks: myTicketsBlocks(req, req.requester_name || 'someone', 'in_progress'),
    });
    console.log(`[slack] started ${requestId} at ${startedAt}`);
  });

  // ── Complete (my-tickets) ─────────────────────────────────────────────────────
  app.action(/^myticket_complete_/, async ({ body, action, ack, client }) => {
    await ack();
    const { requestId } = JSON.parse(action.value);
    const finishedAt = new Date().toISOString();

    const req = store.updateRequest(requestId, { status: 'resolved', finished_at: finishedAt });
    if (!req) { console.warn(`[slack] complete: request ${requestId} not found`); return; }

    // Update my-tickets card to resolved state.
    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      blocks: myTicketsBlocks(req, req.requester_name || 'someone', 'resolved'),
    });

    // Notify the requester's outbound channel.
    const requesterMember = req.requester_id ? router.findByMemberId(req.requester_id) : null;
    if (requesterMember?.outboundChannelId) {
      try {
        await client.chat.postMessage({
          channel: requesterMember.outboundChannelId,
          text: `✅ Your request \`${requestId}\` has been completed.`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text:
                  `✅ *Request completed* \`${requestId}\`\n` +
                  `> ${req.description}\n` +
                  `Done in *${fmtElapsed(req.started_at, finishedAt)}* by <@${body.user.id}>`,
              },
            },
          ],
        });
      } catch (err) {
        console.warn(`[slack] could not notify requester: ${err.message}`);
      }
    }
    console.log(`[slack] completed ${requestId} in ${fmtElapsed(req.started_at, finishedAt)}`);
  });

  // ── Send back (my-tickets) ────────────────────────────────────────────────────
  app.action(/^myticket_sendback_/, async ({ body, action, ack, client }) => {
    await ack();
    const { requestId } = JSON.parse(action.value);
    const now = new Date().toISOString();

    const req = store.updateRequest(requestId, { status: 'pending', assignee_id: 'unassigned', _assigneeSlackId: null, finished_at: now });
    if (!req) { console.warn(`[slack] sendback: request ${requestId} not found`); return; }

    // Update my-tickets card.
    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      blocks: myTicketsBlocks({ ...req, finished_at: now }, req.requester_name || 'someone', 'sent_back'),
    });

    // Try to re-route to another person in the same team (not the current user).
    const deptId = req.description ? null : null; // team is not on req directly — look up via store
    const snap = store.getSnapshot();
    let team = null;
    outer: for (const dept of snap.departments) {
      for (const mem of dept.members) {
        if (mem.requests.find(r => r.id === requestId)) { team = dept.name; break outer; }
      }
    }

    let rerouted = false;
    if (team) {
      const next = router.route(team, body.user.id); // exclude current user
      if (next?.inboundChannelId) {
        try {
          await client.chat.postMessage({
            channel: next.inboundChannelId,
            text: `↩ Re-routed request \`${requestId}\` from a teammate`,
            blocks: inboundBlocks(req, req.requester_name || 'someone'),
          });
          store.updateRequest(requestId, { assignee_id: next.memberId, _assigneeSlackId: next.slackUserId });
          rerouted = true;
          console.log(`[slack] re-routed ${requestId} → ${next.name}`);
        } catch (err) {
          console.warn(`[slack] re-route post failed: ${err.message}`);
        }
      }
    }

    // Notify the original requester.
    const requesterMember = req.requester_id ? router.findByMemberId(req.requester_id) : null;
    if (requesterMember?.outboundChannelId) {
      try {
        await client.chat.postMessage({
          channel: requesterMember.outboundChannelId,
          text: `↩ Your request \`${requestId}\` was sent back${rerouted ? ' and re-routed to another teammate' : ' — no one else available yet'}.`,
        });
      } catch (err) {
        console.warn(`[slack] could not notify requester of sendback: ${err.message}`);
      }
    }
  });

  // ── Raise PR ──────────────────────────────────────────────────────────────────
  app.action(/^pr_/, async ({ body, action, ack, client }) => {
    await ack();
    const { requestId, description } = JSON.parse(action.value);

    await client.chat.update({
      channel: body.channel.id, ts: body.message.ts,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `⏳ Creating GitHub PR for \`${requestId}\`…` } }],
    });

    let pr;
    try {
      pr = await createPR(description);
    } catch (err) {
      await client.chat.update({
        channel: body.channel.id, ts: body.message.ts,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `❌ PR failed: ${err.message}` } }],
      });
      return;
    }

    await client.chat.update({
      channel: body.channel.id, ts: body.message.ts,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `*PR #${pr.number} opened*\n> ${pr.summary}\n<${pr.url}|View on GitHub>` } },
        {
          type: 'actions',
          block_id: `pr_actions_${pr.number}`,
          elements: [
            { type: 'button', action_id: `merge_${pr.number}`, text: { type: 'plain_text', text: '✅ Merge' }, style: 'primary', value: String(pr.number) },
            { type: 'button', action_id: `close_${pr.number}`, text: { type: 'plain_text', text: '❌ Close' }, style: 'danger',   value: String(pr.number) },
          ],
        },
      ],
    });
  });

  // ── Merge PR ──────────────────────────────────────────────────────────────────
  app.action(/^merge_\d+$/, async ({ body, action, ack, client }) => {
    await ack();
    try {
      await mergePR(parseInt(action.value));
      await client.chat.update({
        channel: body.channel.id, ts: body.message.ts,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `✅ PR #${action.value} merged. Change is live.` } }],
      });
    } catch (err) {
      await client.chat.update({
        channel: body.channel.id, ts: body.message.ts,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `❌ Merge failed: ${err.message}` } }],
      });
    }
  });

  // ── Close PR ──────────────────────────────────────────────────────────────────
  app.action(/^close_\d+$/, async ({ body, action, ack, client }) => {
    await ack();
    try {
      await closePR(parseInt(action.value));
      await client.chat.update({
        channel: body.channel.id, ts: body.message.ts,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `🚫 PR #${action.value} closed.` } }],
      });
    } catch (err) {
      await client.chat.update({
        channel: body.channel.id, ts: body.message.ts,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `❌ Close failed: ${err.message}` } }],
      });
    }
  });

  return app;
}

module.exports = { createSlackApp };
