/**
 * Burden score, request normalisation, and aggregation.
 *
 * computeScores(departments, { now }) returns a fully-enriched tree:
 *   - departments[].members[].{ burdenScore, pendingCount, requests (normalised), ... }
 *   - departments[].{ deptScore, pendingTotal, overburdened, underburdened, resolveSpeed, trend14 }
 *   - company.{ score, overburdenedHeadcount, pendingTotal, resolveSpeed }   (visible depts only)
 *   - asOf (the `now` used)
 *
 * Visible-vs-hidden: anything whose id is in HIDDEN_COMPANY_DEPT_IDS is kept on the tree
 * (so it's still reachable via direct navigation) but excluded from the company aggregate.
 */

export const METRICS_AS_OF = new Date('2026-08-15T00:00:00Z');
export const HIDDEN_COMPANY_DEPT_IDS = new Set(['cal']);

export function normaliseRequest(r, assigneeId) {
  if (r.__normalised) return r;
  const created_at = r.created_at || r.timestamp;
  return {
    ...r,
    __normalised: true,
    id: r.id || `gen_${(assigneeId || 'a').replace(/\W/g, '')}_${String(r.description || 'x').slice(0, 8)}`,
    requester_id: r.requester_id || 'org',
    assignee_id: r.assignee_id || assigneeId,
    description: r.description,
    direction: r.direction,
    complexity: r.complexity,
    created_at,
    started_at: r.started_at || r.workBeganAt || created_at,
    finished_at: r.finished_at || r.finishedAt,
    status: r.status,
    processHours: r.processHours,
  };
}

function hoursForResolved(r) {
  if (r.processHours != null && r.processHours >= 0) return r.processHours;
  const b = new Date(r.started_at).getTime();
  const f = r.finished_at
    ? new Date(r.finished_at).getTime()
    : new Date(r.timestamp || r.created_at).getTime();
  if (Number.isFinite(f) && Number.isFinite(b) && f > b) {
    return (f - b) / 3600000;
  }
  return null;
}

function resolveSpeedHPerCForRequests(reqs) {
  const resolved = reqs.filter(x => x.status === 'resolved');
  const parts = [];
  for (const r of resolved) {
    const h = hoursForResolved(r);
    if (h == null) continue;
    parts.push(h / Math.max(0.1, r.complexity || 1));
  }
  if (parts.length < 3) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function avgHoursPerItemForRequests(reqs) {
  const resolved = reqs.filter(x => x.status === 'resolved');
  const hours = [];
  for (const r of resolved) {
    const h = hoursForResolved(r);
    if (h != null) hours.push(h);
  }
  if (hours.length === 0) return null;
  return hours.reduce((a, b) => a + b, 0) / hours.length;
}

function avgComplexityForRequests(reqs) {
  const withC = reqs.filter(r => r.complexity != null && r.complexity > 0);
  if (withC.length === 0) return null;
  return withC.reduce((s, r) => s + r.complexity, 0) / withC.length;
}

/** 14 daily buckets ending at `now`, counting open items at each day's end. */
function buildTrend14(allRequests, now) {
  const days = 14;
  const out = new Array(days).fill(0);
  const dayMs = 86400000;
  const end = new Date(now).setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const dayEnd = end - (days - 1 - i) * dayMs + dayMs;
    let open = 0;
    for (const r of allRequests) {
      const created = new Date(r.created_at).getTime();
      if (!Number.isFinite(created) || created > dayEnd) continue;
      if (r.status === 'resolved') {
        const fin = r.finished_at ? new Date(r.finished_at).getTime() : null;
        if (fin != null && Number.isFinite(fin) && fin < dayEnd) continue;
      }
      open++;
    }
    out[i] = open;
  }
  return out;
}

/** Per-day count of newly-resolved items (last `days` days). Drives the throughput chart. */
function buildDailyResolved(allRequests, now, days = 14) {
  const out = new Array(days).fill(0);
  const dayMs = 86400000;
  const end = new Date(now).setHours(0, 0, 0, 0);
  for (const r of allRequests) {
    if (r.status !== 'resolved' || !r.finished_at) continue;
    const fin = new Date(r.finished_at).getTime();
    if (!Number.isFinite(fin)) continue;
    const dayIdx = days - 1 - Math.floor((end + dayMs - fin) / dayMs);
    if (dayIdx >= 0 && dayIdx < days) out[dayIdx]++;
  }
  return out;
}

/** Per-day count of newly-created items (last `days` days). The "inflow" line. */
function buildDailyCreated(allRequests, now, days = 14) {
  const out = new Array(days).fill(0);
  const dayMs = 86400000;
  const end = new Date(now).setHours(0, 0, 0, 0);
  for (const r of allRequests) {
    if (!r.created_at) continue;
    const cr = new Date(r.created_at).getTime();
    if (!Number.isFinite(cr)) continue;
    const dayIdx = days - 1 - Math.floor((end + dayMs - cr) / dayMs);
    if (dayIdx >= 0 && dayIdx < days) out[dayIdx]++;
  }
  return out;
}

/** Aging buckets for currently-pending items: 0–1d, 1–3d, 3–7d, 7–14d, 14d+. */
const AGING_BUCKET_LABELS = ['<1d', '1–3d', '3–7d', '7–14d', '14d+'];
function buildAgingBuckets(allRequests, now) {
  const out = [0, 0, 0, 0, 0];
  for (const r of allRequests) {
    if (r.status !== 'pending') continue;
    const ageDays = (now - new Date(r.created_at).getTime()) / 86400000;
    if (ageDays < 1) out[0]++;
    else if (ageDays < 3) out[1]++;
    else if (ageDays < 7) out[2]++;
    else if (ageDays < 14) out[3]++;
    else out[4]++;
  }
  return out;
}

/**
 * 2-week open-workload direction for one person: compare mean open count in week 1 vs week 2 of a 14d series.
 * "rising" = more open items on average in recent week (heavier load).
 */
function workloadTrajectoryFromOpenTrend14(trend) {
  if (!trend || trend.length < 8) return 'stable';
  const first = trend.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
  const last = trend.slice(7, 14).reduce((a, b) => a + b, 0) / 7;
  const threshold = 0.35;
  if (last > first + threshold) return 'rising';
  if (last < first - threshold) return 'falling';
  return 'stable';
}

export const AGING_LABELS = AGING_BUCKET_LABELS;
export const AGING_COLORS = ['#16a34a', '#84cc16', '#eab308', '#f97316', '#dc2626'];

function countResolvedSince(allRequests, sinceMs) {
  let n = 0;
  for (const r of allRequests) {
    if (r.status !== 'resolved' || !r.finished_at) continue;
    const fin = new Date(r.finished_at).getTime();
    if (Number.isFinite(fin) && fin >= sinceMs) n++;
  }
  return n;
}

export function computeScores(departments, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const surfaceDepts = departments.filter(d => !HIDDEN_COMPANY_DEPT_IDS.has(d.id));

  const allMembers = surfaceDepts.flatMap(d =>
    d.members.map(m => ({ m, department_id: d.id, dept: d })),
  );

  const memberPre = allMembers.map(({ m, department_id, dept }) => {
    const reqs = (m.requests || []).map(r => normaliseRequest(r, m.id));
    const pending = reqs.filter(x => x.status === 'pending');
    const volume = pending.length;
    const avgCplxPend = pending.length > 0
      ? pending.reduce((s, r) => s + (r.complexity || 0), 0) / pending.length
      : 0;
    const agesDays = pending.map(p => Math.max(0, (now - new Date(p.created_at).getTime()) / 86400000));
    const staleness = pending.length > 0
      ? agesDays.reduce((a, b) => a + b, 0) / agesDays.length
      : 0;
    const oldestPendingDays = pending.length > 0 ? Math.max(...agesDays, 0) : 0;
    return {
      m, department_id, dept,
      memberId: m.id, name: m.name, role: m.role,
      volume, difficulty: avgCplxPend, staleness,
      pending,
      resolved: reqs.filter(x => x.status === 'resolved'),
      reqs,
      oldestPendingDays,
    };
  });

  const minmax = (arr) => {
    const lo = Math.min(...arr);
    const hi = Math.max(...arr);
    return { lo, hi, same: hi <= lo };
  };
  const nv = minmax(memberPre.map(x => x.volume));
  const nd = minmax(memberPre.map(x => x.difficulty));
  const ns = minmax(memberPre.map(x => x.staleness));
  function n01(x, z) {
    if (z.same) return 0.5;
    return (x - z.lo) / (z.hi - z.lo);
  }

  const withRaw = memberPre.map(p => {
    const raw = 0.4 * n01(p.volume, nv)
      + 0.4 * n01(p.difficulty, nd)
      + 0.2 * n01(p.staleness, ns);
    return { ...p, burdenRaw: raw };
  });

  const sorted = [...withRaw].sort((a, b) => a.burdenRaw - b.burdenRaw);
  const n = sorted.length;
  const rankMap = new Map();
  for (let i = 0; i < n; i++) {
    const score = n <= 1 ? 3 : 1 + Math.min(4, Math.floor((5 * i) / n));
    rankMap.set(sorted[i].memberId, score);
  }

  const enrichedDepts = departments.map((dept) => {
    const hidden = HIDDEN_COMPANY_DEPT_IDS.has(dept.id);
    const members = dept.members.map((member) => {
      const pre = withRaw.find(p => p.memberId === member.id);
      if (!pre) {
        return {
          ...member,
          requests: (member.requests || []).map(r => normaliseRequest(r, member.id)),
          burdenScore: 3,
          pendingCount: 0,
          avgComplexityPending: 0,
          oldestPendingDays: 0,
          resolveSpeedHPerC: null,
          inboundPending: 0,
          outboundPending: 0,
          resolvedCount: 0,
          label: 'well burdened',
          openTrend14: new Array(14).fill(0),
          workloadTrajectory: 'stable',
        };
      }
      const burdenScore = rankMap.get(member.id) ?? 3;
      const sp = resolveSpeedHPerCForRequests(pre.reqs);
      const openTrend14 = buildTrend14(pre.reqs, now);
      const workloadTrajectory = workloadTrajectoryFromOpenTrend14(openTrend14);
      return {
        ...member,
        requests: pre.reqs,
        burdenScore,
        pendingCount: pre.volume,
        avgComplexityPending: pre.difficulty,
        oldestPendingDays: pre.oldestPendingDays,
        resolveSpeedHPerC: sp,
        inboundPending: pre.pending.filter(r => r.direction === 'inbound').length,
        outboundPending: pre.pending.filter(r => r.direction === 'outbound').length,
        resolvedCount: pre.resolved.length,
        label: labelFor(burdenScore),
        openTrend14,
        workloadTrajectory,
      };
    });

    const memberScores = members.map(m => m.burdenScore);
    const deptScore = members.length
      ? Math.round((memberScores.reduce((a, b) => a + b, 0) / members.length) * 10) / 10
      : 0;
    const overburdened = members.filter(m => m.burdenScore === 4 || m.burdenScore === 5).length;
    const underburdened = members.filter(m => m.burdenScore === 1 || m.burdenScore === 2).length;
    const pendingTotal = members.reduce((s, m) => s + m.pendingCount, 0);
    const allR = members.flatMap(m => m.requests || []);
    const deptResolve = resolveSpeedHPerCForRequests(allR);
    const trend14 = buildTrend14(allR, now);
    const dailyResolved14 = buildDailyResolved(allR, now);
    const dailyCreated14 = buildDailyCreated(allR, now);
    const aging = buildAgingBuckets(allR, now);
    const sevenDaysAgo = now.getTime() - 7 * 86400000;
    const todayStart = now.getTime() - 86400000;
    const throughput7d = countResolvedSince(allR, sevenDaysAgo);
    const closedToday = countResolvedSince(allR, todayStart);
    const avgHoursPerItem = avgHoursPerItemForRequests(allR);
    const avgComplexityAll = avgComplexityForRequests(allR);

    for (const m of members) {
      m.throughput7d = countResolvedSince(m.requests || [], sevenDaysAgo);
    }

    return {
      ...dept,
      members,
      deptScore,
      overburdened,
      underburdened,
      hidden,
      pendingTotal,
      headcount: members.length,
      resolveSpeed: deptResolve,
      trend14,
      dailyResolved14,
      dailyCreated14,
      aging,
      throughput7d,
      closedToday,
      avgHoursPerItem,
      avgComplexityAll,
    };
  });

  const vis = enrichedDepts.filter(d => !d.hidden);
  const visPeople = vis.flatMap(d => d.members);
  const visReqs = visPeople.flatMap(m => m.requests || []);
  const compScore = vis.length
    ? Math.round((vis.reduce((s, d) => s + d.deptScore, 0) / vis.length) * 10) / 10
    : 0;
  const memberBurdenMean = visPeople.length
    ? Math.round((visPeople.reduce((s, m) => s + m.burdenScore, 0) / visPeople.length) * 10) / 10
    : 0;
  const withSp = visPeople.filter(m => m.resolveSpeedHPerC != null);
  const companyResolve = withSp.length
    ? withSp.reduce((s, m) => s + m.resolveSpeedHPerC, 0) / withSp.length
    : resolveSpeedHPerCForRequests(visReqs);

  const sevenDaysAgo = now.getTime() - 7 * 86400000;
  const todayStart = now.getTime() - 86400000;
  return {
    departments: enrichedDepts,
    visibleDepartments: vis,
    company: {
      score: compScore,
      memberBurdenMean,
      overburdenedHeadcount: visPeople.filter(m => m.burdenScore === 4 || m.burdenScore === 5).length,
      underburdenedHeadcount: visPeople.filter(m => m.burdenScore === 1 || m.burdenScore === 2).length,
      pendingTotal: vis.reduce((s, d) => s + d.pendingTotal, 0),
      headcount: visPeople.length,
      resolveSpeed: companyResolve,
      trend14: buildTrend14(visReqs, now),
      dailyResolved14: buildDailyResolved(visReqs, now),
      dailyCreated14: buildDailyCreated(visReqs, now),
      aging: buildAgingBuckets(visReqs, now),
      throughput7d: countResolvedSince(visReqs, sevenDaysAgo),
      closedToday: countResolvedSince(visReqs, todayStart),
      avgHoursPerItem: avgHoursPerItemForRequests(visReqs),
      avgComplexityAll: avgComplexityForRequests(visReqs),
    },
    asOf: now,
  };
}

function labelFor(s) {
  if (s <= 2) return 'underutilised';
  if (s === 3) return 'well burdened';
  return 'overburdened';
}

export function findRedistributeMatch(overMember, sameDeptMembers) {
  if (!overMember || (overMember.burdenScore ?? 0) < 5) return null;
  const cOver = overMember.avgComplexityPending || 0;
  const others = sameDeptMembers.filter(
    o => o.id !== overMember.id && (o.burdenScore ?? 5) <= 2,
  );
  if (others.length === 0) return null;
  const best = others.reduce((a, b) => {
    const da = Math.abs((a.avgComplexityPending || 0) - cOver);
    const db = Math.abs((b.avgComplexityPending || 0) - cOver);
    return da <= db ? a : b;
  });
  return { member: best, text: `${best.name} (score ${best.burdenScore}) has capacity for similar work` };
}

export function computeLoadBalancePercent(members) {
  if (!members || members.length === 0) {
    return { percent: 100, detail: 'No people in view.' };
  }
  if (members.length === 1) {
    return { percent: 100, detail: 'Single person — no spread to compare.' };
  }
  const s = members.map(m => m.burdenScore);
  const high = s.filter(x => x >= 4);
  const low = s.filter(x => x <= 2);
  let diff;
  if (high.length > 0 && low.length > 0) {
    const mh = high.reduce((a, b) => a + b, 0) / high.length;
    const ml = low.reduce((a, b) => a + b, 0) / low.length;
    diff = mh - ml;
  } else {
    diff = Math.max(...s) - Math.min(...s);
  }
  const pct = Math.round(100 * (1 - Math.min(4, diff) / 4));
  const percent = Math.max(0, Math.min(100, pct));
  return {
    percent,
    detail: `Gap between high and low burden ≈ ${diff.toFixed(2)} (on 1–5). 100% is even; lower means more maldistribution.`,
  };
}

/** Distribution histogram across the 5 score buckets, useful for the load-balance panel. */
export function distribution(members) {
  const out = [0, 0, 0, 0, 0];
  for (const m of members || []) {
    const s = m.burdenScore;
    if (s >= 1 && s <= 5) out[s - 1]++;
  }
  return out;
}

/* Score colour system. Values are intentionally a 5-step diverging palette around the
 * green "well burdened" centre, matching the README copy: cool = under, green = good,
 * warm = over. */
export const SCORE_COLORS = {
  1: '#1d4ed8',
  2: '#7dd3fc',
  3: '#16a34a',
  4: '#D85A30',
  5: '#E24B4A',
};

export const SCORE_BADGE_TEXT = {
  1: '#fff',
  2: '#0f172a',
  3: '#fff',
  4: '#fff',
  5: '#fff',
};

export const SCORE_LABELS = {
  1: 'highly underutilised',
  2: 'underutilised',
  3: 'well burdened',
  4: 'overburdened',
  5: 'highly overburdened',
};

/** Heat-map ramp for "load" (more = hotter). Used for Pending and similar columns. */
export function heatColorForFraction(t) {
  if (t == null || Number.isNaN(t)) return 'transparent';
  const x = Math.max(0, Math.min(1, t));
  const alpha = 0.06 + x * 0.34;
  return `rgba(216, 90, 48, ${alpha.toFixed(3)})`;
}

/** Inverse heat — slow (= big number) is hotter. Used for resolve speed (lower is better). */
export function heatColorForResolve(value, allValues) {
  if (value == null || !Number.isFinite(value)) return 'transparent';
  const nums = allValues.filter(v => v != null && Number.isFinite(v));
  if (nums.length < 2) return 'transparent';
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  if (hi <= lo) return 'transparent';
  const t = (value - lo) / (hi - lo);
  return heatColorForFraction(t);
}
