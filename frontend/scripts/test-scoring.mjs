/**
 * Dependency-free smoke tests for src/utils/scoring.js.
 *
 * Run with:  node scripts/test-scoring.mjs
 *
 * These exist to catch the "I changed scoring.js and silently rebucketed
 * the entire org" class of regression. They pin invariants, not exact ranks.
 */
import assert from 'node:assert/strict';
import {
  computeScores,
  computeLoadBalancePercent,
  distribution,
  HIDDEN_COMPANY_DEPT_IDS,
  SCORE_COLORS,
  SCORE_LABELS,
} from '../src/utils/scoring.js';

const NOW = new Date('2026-08-15T00:00:00Z');

function dept(id, name, members) {
  return { id, name, members: members.map(m => ({ ...m, department_id: id })) };
}

function req(over) {
  return {
    id: `r${Math.random().toString(36).slice(2, 7)}`,
    description: 'x',
    direction: 'inbound',
    complexity: 5,
    created_at: '2026-08-10T00:00:00Z',
    started_at: '2026-08-10T00:00:00Z',
    status: 'pending',
    ...over,
  };
}

const fixture = [
  dept('eng', 'Engineering', [
    { id: 'e1', name: 'Alice',   role: 'Eng', requests: [req({ complexity: 9 }), req({ complexity: 9 }), req({ complexity: 9 })] },
    { id: 'e2', name: 'Bob',     role: 'Eng', requests: [req({ complexity: 1, status: 'resolved', finished_at: '2026-08-10T01:00:00Z', processHours: 1 })] },
  ]),
  dept('sales', 'Sales', [
    { id: 's1', name: 'Carol',   role: 'AE',  requests: [req({ complexity: 5 }), req({ complexity: 6 })] },
  ]),
  dept('cal', 'Calendar', [
    { id: 'c1', name: 'Hidden',  role: 'Bot', requests: [req({ complexity: 9 })] },
  ]),
];

const data = computeScores(fixture, { now: NOW });

/* 1. Hidden dept stays in tree (reachable by direct nav) but not aggregated. */
assert.equal(data.departments.length, 3, 'all depts present in tree');
assert.equal(data.visibleDepartments.length, 2, 'hidden dept excluded from visible');
assert.ok(HIDDEN_COMPANY_DEPT_IDS.has('cal'));
assert.ok(!data.visibleDepartments.find(d => d.id === 'cal'), 'cal not in visibleDepartments');

/* 2. Burden score is in [1,5] for everyone. */
for (const d of data.visibleDepartments) {
  for (const m of d.members) {
    assert.ok(m.burdenScore >= 1 && m.burdenScore <= 5, `burdenScore in range for ${m.name}`);
  }
}

/* 3. Highest-volume + highest-difficulty member tops the bucket. */
const eng = data.departments.find(d => d.id === 'eng');
const alice = eng.members.find(m => m.id === 'e1');
const bob = eng.members.find(m => m.id === 'e2');
assert.ok(alice.burdenScore >= bob.burdenScore, 'Alice (3 cplx-9 open) >= Bob (none open)');

/* 4. Pending count and oldest-pending derived correctly. */
assert.equal(alice.pendingCount, 3);
assert.equal(bob.pendingCount, 0);
assert.equal(alice.outboundPending + alice.inboundPending, alice.pendingCount);

/* 5. Resolved-only member: resolveSpeed needs >=3 resolved to be non-null. */
assert.equal(bob.resolveSpeedHPerC, null, 'fewer than 3 resolved => null');

/* 6. Company aggregates exclude hidden dept. */
assert.equal(data.company.headcount, 3, 'headcount excludes hidden dept');
assert.ok(data.company.pendingTotal >= 5, 'pending counts roll up from visible');
assert.ok(data.company.score >= 1 && data.company.score <= 5);

/* 7. Trend / daily-series / aging shapes are right and non-negative. */
assert.equal(data.company.trend14.length, 14);
for (const v of data.company.trend14) assert.ok(v >= 0);
assert.equal(data.company.dailyResolved14.length, 14);
assert.equal(data.company.dailyCreated14.length, 14);
assert.equal(data.company.aging.length, 5);
for (const d of data.visibleDepartments) {
  assert.equal(d.trend14.length, 14);
  assert.equal(d.dailyResolved14.length, 14);
  assert.equal(d.dailyCreated14.length, 14);
  assert.equal(d.aging.length, 5);
  assert.ok(typeof d.throughput7d === 'number' && d.throughput7d >= 0);
}
assert.ok(typeof data.company.throughput7d === 'number');

/* 7b. Aging buckets sum to current pending count for the dept. */
for (const d of data.visibleDepartments) {
  const sumAging = d.aging.reduce((a, b) => a + b, 0);
  assert.equal(sumAging, d.pendingTotal, `aging sum == pendingTotal for ${d.id}`);
}

/* 7c. Per-member throughput7d is set. */
for (const d of data.visibleDepartments) {
  for (const m of d.members) {
    assert.ok(typeof m.throughput7d === 'number');
  }
}

/* 8. Distribution sums to people count. */
const dist = distribution(data.visibleDepartments.flatMap(d => d.members));
assert.equal(dist.reduce((a, b) => a + b, 0), 3);

/* 9. Load balance percent is bounded. */
const lb = computeLoadBalancePercent(data.visibleDepartments.flatMap(d => d.members));
assert.ok(lb.percent >= 0 && lb.percent <= 100);

/* 10. Palette and labels cover all 5 buckets. */
for (const s of [1, 2, 3, 4, 5]) {
  assert.ok(SCORE_COLORS[s], `colour for ${s}`);
  assert.ok(SCORE_LABELS[s], `label for ${s}`);
}

/* 11. Re-running computeScores is a pure function of inputs. */
const data2 = computeScores(fixture, { now: NOW });
assert.deepEqual(
  data.visibleDepartments.map(d => [d.id, d.deptScore, d.pendingTotal]),
  data2.visibleDepartments.map(d => [d.id, d.deptScore, d.pendingTotal]),
  'computeScores is deterministic for fixed now',
);

/* 12. Defensive: member with no requests field doesn't crash. */
const sparse = computeScores(
  [dept('eng', 'Engineering', [{ id: 'x', name: 'Empty', role: 'Eng' }])],
  { now: NOW },
);
assert.equal(sparse.departments[0].members[0].pendingCount, 0);
assert.equal(sparse.departments[0].members[0].requests.length, 0);

console.log('OK  scoring.js — all assertions pass');
