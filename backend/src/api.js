/**
 * Express REST API consumed by the dashboard frontend.
 *
 * GET  /api/snapshot          — full departments/members/requests tree
 * POST /api/members           — register a Slack user ↔ internal member mapping
 * GET  /api/members           — list all registered mappings
 * POST /api/requests          — create a request manually (bypasses Slack)
 * POST /api/requests/:id/resolve — resolve a request
 */

const express = require('express');
const cors = require('cors');
const store = require('./store');
const appRouter = require('./router');

const router = express.Router();

// In-memory member map for the GET /api/members listing
let memberMapRaw = {};

// ── GET /api/snapshot ────────────────────────────────────────────────────────
router.get('/snapshot', (req, res) => {
  res.json(store.getSnapshot());
});

// ── GET /api/members ─────────────────────────────────────────────────────────
router.get('/members', (req, res) => {
  res.json(appRouter.getAll());
});

/**
 * POST /api/members
 * Body: { slackUserId, memberId, memberName, deptId, deptName, role? }
 */
router.post('/members', express.json(), (req, res) => {
  const { slackUserId, memberId, memberName, deptId, deptName, role = '' } = req.body;
  if (!slackUserId || !memberId || !memberName || !deptId || !deptName) {
    return res.status(400).json({ error: 'slackUserId, memberId, memberName, deptId, deptName are required' });
  }
  memberMapRaw[slackUserId] = { memberId, memberName, deptId, deptName, role };
  store.upsertMember(deptId, deptName, memberId, memberName, role);
  appRouter.register(slackUserId, { memberId, name: memberName, team: deptName, role });
  res.json({ ok: true, mapping: memberMapRaw[slackUserId] });
});

/**
 * POST /api/requests
 * Body: { deptId, deptName, memberId, memberName, description, complexity?, direction?, requesterId? }
 */
router.post('/requests', express.json(), (req, res) => {
  const {
    deptId, deptName, memberId, memberName,
    description, complexity = 5, direction = 'inbound', requesterId = 'api',
  } = req.body;

  if (!deptId || !memberId || !description) {
    return res.status(400).json({ error: 'deptId, memberId, description are required' });
  }

  const id = `r_${Date.now().toString(36)}`;
  const request = {
    id,
    requester_id: requesterId,
    assignee_id: memberId,
    description,
    direction,
    complexity: Math.min(10, Math.max(1, Number(complexity) || 5)),
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    timestamp: new Date().toISOString(),
    processHours: null,
    status: 'pending',
  };

  store.upsertRequest(deptId, deptName || deptId, memberId, memberName || memberId, request);
  res.status(201).json({ ok: true, request });
});

/**
 * POST /api/requests/:id/resolve
 * Body: { memberId?, hours? }
 */
router.post('/requests/:id/resolve', express.json(), (req, res) => {
  const { id } = req.params;
  const { memberId = null, hours = null } = req.body;

  // If memberId is given, target it directly; otherwise scan.
  let result = memberId ? store.resolveRequest(memberId, id, hours) : null;
  if (!result) {
    const snap = store.getSnapshot();
    for (const dept of snap.departments) {
      for (const member of dept.members) {
        if (member.requests.some(r => r.id === id)) {
          result = store.resolveRequest(member.id, id, hours);
          break;
        }
      }
      if (result) break;
    }
  }

  if (!result) return res.status(404).json({ error: `Request ${id} not found` });
  res.json({ ok: true, request: result });
});

function createApiApp() {
  const app = express();
  app.use(cors());
  app.use('/api', router);
  return app;
}

module.exports = { createApiApp };
