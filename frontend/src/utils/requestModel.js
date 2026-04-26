/**
 * Canonical request / ticket fields — aligned with the backend.
 *
 * id, description, complexity, direction, status
 * created_at, accepted_at, started_at, finished_at
 * requester_id, requester_name, assignee_id, _assigneeSlackId (optional, Slack)
 *
 * Derived: age, work duration, hours per item — use helpers, do not store duplicates.
 */

/** Workflow states (assignee’s ticket) */
export const STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  DENIED: 'denied',
  SENT_BACK: 'sent_back',
};

export const OPEN_STATUSES = new Set([
  STATUS.PENDING,
  STATUS.ACCEPTED,
  STATUS.IN_PROGRESS,
]);

const TERMINAL_SUCCESS = new Set([STATUS.RESOLVED]);
const TERMINAL_END = new Set([STATUS.RESOLVED, STATUS.DENIED, STATUS.SENT_BACK]);

export function isRequestOpen(r) {
  const s = (r && r.status) || '';
  return OPEN_STATUSES.has(s);
}

/** Done successfully — for throughput, resolve speed, etc. */
export function isRequestResolved(r) {
  return (r && r.status) === STATUS.RESOLVED;
}

export function isRequestDenied(r) {
  return (r && r.status) === STATUS.DENIED;
}

export function isRequestTerminal(r) {
  return TERMINAL_END.has((r && r.status) || '');
}

/**
 * Legacy / demo: map old string values; unknown → pending.
 */
function coerceStatus(s) {
  if (!s) return STATUS.PENDING;
  if (s === 'pending') return STATUS.PENDING;
  if (s === 'resolved') return STATUS.RESOLVED;
  if (s === 'merged') return STATUS.RESOLVED; // GitHub PR merged — treat as done in metrics
  if (s === 'denied') return STATUS.DENIED;
  if (s === 'sent_back') return STATUS.SENT_BACK;
  if (Object.values(STATUS).includes(s)) return s;
  return STATUS.PENDING;
}

/**
 * Returns a single canonical request object. Idempotent (guarded by __normalised).
 * Strips legacy aliases (timestamp, workBeganAt, finishedAt) from the merged shape.
 */
export function normaliseRequest(r, assigneeId) {
  if (r?.__normalised) return r;
  const {
    timestamp, workBeganAt, finishedAt, __normalised, ...rest
  } = r;
  const created = r.created_at || timestamp || new Date(0).toISOString();
  return {
    ...rest,
    __normalised: true,
    processHours: r.processHours,
    id:
      r.id
      || `gen_${(assigneeId || 'a').replace(/\W/g, '')}_${String(r.description || 'x').slice(0, 8)}`,
    requester_id: r.requester_id != null && r.requester_id !== '' ? r.requester_id : 'org',
    requester_name: r.requester_name,
    assignee_id: r.assignee_id || assigneeId,
    description: r.description,
    direction: r.direction,
    complexity: r.complexity,
    created_at: created,
    accepted_at: r.accepted_at || null,
    started_at: r.started_at || workBeganAt || null,
    finished_at: r.finished_at || finishedAt || null,
    status: coerceStatus(r.status),
    _assigneeSlackId: r._assigneeSlackId,
  };
}

const MS_H = 3600000;

/** Hours of active work: started → finished, or started → `now` if still in progress. */
export function workDurationMs(r, now = new Date()) {
  if (!r?.started_at) return null;
  const a = new Date(r.started_at).getTime();
  if (!Number.isFinite(a)) return null;
  const end = r.finished_at ? new Date(r.finished_at).getTime() : now.getTime();
  if (!Number.isFinite(end) || end < a) return null;
  return end - a;
}

export function workDurationHours(r, now = new Date()) {
  const ms = workDurationMs(r, now);
  return ms == null ? null : ms / MS_H;
}

/** For resolved items: use explicit processHours if present in legacy data; else derive from timestamps. */
export function hoursForResolvedItem(r) {
  if (r.processHours != null && r.processHours >= 0) return r.processHours;
  if (!isRequestResolved(r) || !r.finished_at) return null;
  const b = new Date(r.started_at || r.created_at).getTime();
  const f = new Date(r.finished_at).getTime();
  if (Number.isFinite(f) && Number.isFinite(b) && f > b) {
    return (f - b) / MS_H;
  }
  return workDurationHours(r) ?? null;
}

/** Time since create until now (or until finished if you pass endAsFinished). */
export function ageOpenMs(r, now = new Date()) {
  if (!r?.created_at) return null;
  const c = new Date(r.created_at).getTime();
  if (!Number.isFinite(c)) return null;
  return now.getTime() - c;
}

/** “Time in progress” in UI: while open after start, or total work if closed. */
export function activeWorkWindowMs(r, now = new Date()) {
  if (!r?.started_at) return null;
  const a = new Date(r.started_at).getTime();
  if (!Number.isFinite(a)) return null;
  if (isRequestOpen(r)) return Math.max(0, now.getTime() - a);
  if (r.finished_at) {
    const f = new Date(r.finished_at).getTime();
    if (Number.isFinite(f) && f >= a) return f - a;
  }
  return null;
}

/**
 * For 14d trend: request still in backlog at this instant (no finish, or finish after `dayEndMs`).
 */
export function isOpenAtDayEnd(r, dayEndMs) {
  const created = new Date(r.created_at).getTime();
  if (!Number.isFinite(created) || created > dayEndMs) return false;
  if (!r.finished_at) return true;
  const fin = new Date(r.finished_at).getTime();
  if (!Number.isFinite(fin)) return true;
  return fin > dayEndMs;
}
