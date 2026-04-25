/**
 * Handles the #employee-onboarding channel.
 *
 * A message like "@alice is the new marketing head" will:
 *  1. Resolve Alice's Slack ID from the mention
 *  2. Parse her role + team via Gemini
 *  3. Create private #outbound-alice and #inbound-alice channels
 *  4. Invite Alice to both
 *  5. Register her in the router + store
 *  6. Post welcome messages in both channels
 */

const { parseOnboarding } = require('./parser');
const router = require('./router');
const store  = require('./store');

async function findChannelByName(client, name) {
  let cursor;
  do {
    const list = await client.conversations.list({
      types: 'private_channel,public_channel',
      exclude_archived: false,
      limit: 1000,
      cursor,
    });
    const found = list.channels?.find(c => c.name === name);
    if (found) return found;
    cursor = list.response_metadata?.next_cursor;
  } while (cursor);
  return null;
}

async function createWithSuffix(client, baseName, isPrivate) {
  for (let i = 2; i <= 50; i++) {
    const candidate = `${baseName}-${i}`.slice(0, 80);
    try {
      const res = await client.conversations.create({ name: candidate, is_private: isPrivate });
      return res.channel;
    } catch (err) {
      if (err.data?.error !== 'name_taken') throw err;
    }
  }
  throw new Error(`exhausted suffixes for ${baseName}`);
}

// Slack does not let bots hard-delete channels, so a "deleted" channel from
// the UI is really just archived. If the next onboarding tries to create the
// same name, conversations.create returns name_taken. We:
//   1. unarchive + reuse if possible (cheap, preserves history),
//   2. otherwise rename the archived channel aside and create fresh,
//   3. otherwise create with a numeric suffix.
async function safeCreateChannel(client, name, isPrivate = true) {
  try {
    const res = await client.conversations.create({ name, is_private: isPrivate });
    return res.channel;
  } catch (err) {
    if (err.data?.error !== 'name_taken') throw err;
  }

  const existing = await findChannelByName(client, name);
  if (!existing) {
    // name_taken but bot can't see the channel — fall back to suffix.
    return createWithSuffix(client, name, isPrivate);
  }

  if (!existing.is_archived) return existing;

  // Try unarchive first.
  try {
    await client.conversations.unarchive({ channel: existing.id });
    console.log(`[onboarding] unarchived #${name} (${existing.id})`);
    return existing;
  } catch (err) {
    console.warn(`[onboarding] could not unarchive #${name} (${err.data?.error || err.message}); renaming aside.`);
  }

  // Rename archived channel out of the way so we can claim the name.
  const stamp = Date.now().toString(36);
  const aside = `${name}-old-${stamp}`.slice(0, 80);
  try {
    await client.conversations.rename({ channel: existing.id, name: aside });
    console.log(`[onboarding] renamed archived #${name} → #${aside}`);
  } catch (err) {
    console.warn(`[onboarding] could not rename archived #${name} (${err.data?.error || err.message}); using suffix instead.`);
    return createWithSuffix(client, name, isPrivate);
  }

  try {
    const res = await client.conversations.create({ name, is_private: isPrivate });
    return res.channel;
  } catch (err) {
    console.warn(`[onboarding] create after rename failed (${err.data?.error || err.message}); using suffix.`);
    return createWithSuffix(client, name, isPrivate);
  }
}

async function onboardMember({ mentionedUserId, messageText, client, say }) {
  // ── 1. Resolve real name ───────────────────────────────────────────────────
  let name, firstName;
  try {
    const info = await client.users.info({ user: mentionedUserId });
    name = info.user?.real_name || info.user?.profile?.display_name || mentionedUserId;
  } catch {
    name = mentionedUserId;
  }
  firstName = name.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

  // ── 2. Parse role + team ───────────────────────────────────────────────────
  const cleanText = messageText.replace(/<@\w+>/g, name);
  let parsed;
  try {
    parsed = await parseOnboarding(cleanText);
  } catch (err) {
    await say(`❌ Could not parse role/team: ${err.message}`);
    return;
  }

  // ── 3. Create private channels ─────────────────────────────────────────────
  const outboundName  = `outbound-${firstName}`;
  const inboundName   = `inbound-${firstName}`;
  const myTicketsName = `my-tickets-${firstName}`;

  let outboundCh, inboundCh, myTicketsCh;
  try {
    [outboundCh, inboundCh, myTicketsCh] = await Promise.all([
      safeCreateChannel(client, outboundName),
      safeCreateChannel(client, inboundName),
      safeCreateChannel(client, myTicketsName),
    ]);
  } catch (err) {
    await say(`❌ Could not create channels: ${err.message}`);
    return;
  }

  // ── 4. Invite the member ───────────────────────────────────────────────────
  try {
    await Promise.all([
      client.conversations.invite({ channel: outboundCh.id,  users: mentionedUserId }),
      client.conversations.invite({ channel: inboundCh.id,   users: mentionedUserId }),
      client.conversations.invite({ channel: myTicketsCh.id, users: mentionedUserId }),
    ]);
  } catch (err) {
    const e = err.data?.error || err.message;
    if (!['already_in_channel', 'cant_invite_self', 'is_archived'].includes(e)) {
      console.warn('[onboarding] invite error:', err.message);
    }
  }

  // ── 5. Register in router + store ─────────────────────────────────────────
  const memberId = `m_${mentionedUserId}`;
  const deptId   = parsed.team.toLowerCase().replace(/\s+/g, '_');

  router.register(mentionedUserId, {
    memberId,
    name,
    team: parsed.team,
    role: parsed.role,
  });
  router.registerChannels(mentionedUserId, outboundCh.id, inboundCh.id, myTicketsCh.id);
  store.upsertMember(deptId, parsed.team, memberId, name, parsed.role);
  store.upsertPerson({
    id: memberId,
    name,
    position: parsed.role,
    department: parsed.team,
    slackUserId: mentionedUserId,
  });

  // ── 6. Welcome messages ────────────────────────────────────────────────────
  await client.chat.postMessage({
    channel: outboundCh.id,
    text: `👋 Hi ${name.split(' ')[0]}! Post your requests here and I'll route them to the right person automatically. Each one becomes a tracked ticket.`,
  });

  await client.chat.postMessage({
    channel: inboundCh.id,
    text: `👋 Hi ${name.split(' ')[0]}! Work assigned to you will appear here. Accept, deny, or raise a GitHub PR from each card.`,
  });

  await client.chat.postMessage({
    channel: myTicketsCh.id,
    text: `👋 Hi ${name.split(' ')[0]}! Tickets you accept will land here. Start a timer, mark complete, or send back to the team.`,
  });

  // ── 7. Confirm in onboarding channel ──────────────────────────────────────
  await say({
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `✅ *${name}* onboarded as *${parsed.role}* in *${parsed.team}*\n` +
            `Channels: <#${outboundCh.id}> · <#${inboundCh.id}> · <#${myTicketsCh.id}>`,
        },
      },
    ],
  });

  console.log(`[onboarding] ${name} → ${parsed.team} / ${parsed.role} | out:${outboundCh.id} in:${inboundCh.id} tickets:${myTicketsCh.id}`);
  return { memberId, name, team: parsed.team, role: parsed.role };
}

module.exports = { onboardMember };
