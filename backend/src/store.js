/**
 * In-memory store with a JSON file as a simple persistence layer.
 * Shape mirrors the frontend's db.json so the dashboard can consume
 * both sources with the same code path.
 *
 * Real database (Postgres, SQLite, etc.) can drop in here later.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) return { departments: [] };
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { departments: [] };
  }
}

function save(db) {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = load();

// ─── helpers ────────────────────────────────────────────────────────────────

function getDept(id) {
  return db.departments.find(d => d.id === id) ?? null;
}

function upsertDept(id, name) {
  let dept = getDept(id);
  if (!dept) {
    dept = { id, name, members: [] };
    db.departments.push(dept);
  }
  return dept;
}

function getMember(deptId, memberId) {
  const dept = getDept(deptId);
  return dept?.members.find(m => m.id === memberId) ?? null;
}

function upsertMember(deptId, deptName, memberId, memberName, role = '') {
  upsertDept(deptId, deptName);
  const dept = getDept(deptId);
  let member = dept.members.find(m => m.id === memberId);
  if (!member) {
    member = { id: memberId, name: memberName, role, department_id: deptId, requests: [] };
    dept.members.push(member);
  }
  return member;
}

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Add or update a request on a member.
 * If the member/dept don't exist yet they are created automatically.
 */
function upsertRequest(deptId, deptName, memberId, memberName, request) {
  upsertMember(deptId, deptName, memberId, memberName);
  const dept = getDept(deptId);
  const member = dept.members.find(m => m.id === memberId);

  const existing = member.requests.findIndex(r => r.id === request.id);
  if (existing >= 0) {
    member.requests[existing] = { ...member.requests[existing], ...request };
  } else {
    member.requests.push(request);
  }
  save(db);
  return request;
}

function resolveRequest(memberId, requestId, processHours = null) {
  for (const dept of db.departments) {
    const member = dept.members.find(m => m.id === memberId);
    if (!member) continue;
    const req = member.requests.find(r => r.id === requestId);
    if (!req) continue;
    req.status = 'resolved';
    req.finished_at = new Date().toISOString();
    if (processHours != null) req.processHours = processHours;
    save(db);
    return req;
  }
  return null;
}

function getSnapshot() {
  return JSON.parse(JSON.stringify(db));
}

module.exports = { upsertRequest, resolveRequest, getSnapshot, upsertMember, upsertDept };
