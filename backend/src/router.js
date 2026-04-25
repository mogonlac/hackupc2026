/**
 * Central registry for members and their personal Slack channels.
 * Persisted to data/registry.json so restarts don't lose channel mappings.
 */

const fs   = require('fs');
const path = require('path');
const store = require('./store');

const DATA_DIR     = path.join(__dirname, '..', 'data');
const REGISTRY_FILE = path.join(DATA_DIR, 'registry.json');

function loadRegistry() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(REGISTRY_FILE)) return { members: {}, channels: {} };
  try { return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')); } catch { return { members: {}, channels: {} }; }
}

function saveRegistry() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify({ members: _registry, channels: _channels }, null, 2));
}

const _loaded = loadRegistry();
// slackUserId → { memberId, name, team, role, slackUserId, outboundChannelId, inboundChannelId }
let _registry = _loaded.members  || {};
// channelId   → { type: 'outbound'|'inbound', slackUserId }
let _channels  = _loaded.channels || {};

console.log(`[router] loaded ${Object.keys(_registry).length} members, ${Object.keys(_channels).length} channels from disk`);

function register(slackUserId, info) {
  _registry[slackUserId] = { ..._registry[slackUserId], ...info, slackUserId };
  saveRegistry();
}

function registerChannels(slackUserId, outboundChannelId, inboundChannelId, myTicketsChannelId) {
  _registry[slackUserId] = { ..._registry[slackUserId], outboundChannelId, inboundChannelId, myTicketsChannelId };
  _channels[outboundChannelId] = { type: 'outbound',   slackUserId };
  _channels[inboundChannelId]  = { type: 'inbound',    slackUserId };
  if (myTicketsChannelId) _channels[myTicketsChannelId] = { type: 'my-tickets', slackUserId };
  saveRegistry();
}

function getAll() {
  return Object.values(_registry);
}

function findBySlackId(slackUserId) {
  return _registry[slackUserId] ?? null;
}

function findByMemberId(memberId) {
  return Object.values(_registry).find(m => m.memberId === memberId) ?? null;
}

function findByName(name) {
  const lower = name.toLowerCase();
  return Object.values(_registry).find(m => m.name?.toLowerCase().includes(lower)) ?? null;
}

/** Returns { type, slackUserId } for a channel, or null if unrecognised. */
function getChannelInfo(channelId) {
  return _channels[channelId] ?? null;
}

/**
 * Pick the least-loaded registered member in a given team.
 * Returns the full member record or null if nobody is registered for that team.
 */
function route(teamName, excludeSlackId = null) {
  const teamLower = teamName.toLowerCase();
  const candidates = Object.values(_registry).filter(
    m => (m.team || '').toLowerCase() === teamLower && m.slackUserId !== excludeSlackId,
  );
  if (!candidates.length) return null;

  const snap = store.getSnapshot();
  const openCount = {};
  for (const dept of snap.departments) {
    for (const member of dept.members) {
      const open = member.requests.filter(
        r => !r.finished_at && r.status !== 'resolved',
      ).length;
      openCount[member.id] = (openCount[member.id] ?? 0) + open;
    }
  }

  candidates.sort((a, b) => (openCount[a.memberId] ?? 0) - (openCount[b.memberId] ?? 0));
  return candidates[0];
}

module.exports = { register, registerChannels, getAll, findBySlackId, findByMemberId, findByName, getChannelInfo, route };
