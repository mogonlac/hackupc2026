/**
 * Deterministic SLAP database generator.
 *
 * Each department has a *story profile* — heavy / mixed / healthy / etc. — and the
 * generator emits requests whose volumes, complexities, ages and resolve times line
 * up with that profile. The resulting db.json is built so the dashboard tells a
 * coherent story at a glance:
 *
 *   Sales         — heavily overworked, growing backlog, slow resolves
 *   Engineering   — mixed; one or two stars drowning, rest fine
 *   Data Science  — maldistributed; one rockstar, rest underused
 *   Operations    — recent incident spike (last 4 days)
 *   Marketing     — healthy, well balanced
 *   Product       — clear capacity to absorb work
 *   Program Office— hidden, minimal data
 *
 * Run:  node scripts/generate-db.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'db.json');

/* Reference "now". Anchored at the dashboard's current real-clock so the
 * 14-day trend window is fully populated. */
const NOW = new Date('2026-04-25T17:00:00Z');
const DAY = 86_400_000;

/* Seeded RNG so the file is reproducible. */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function rnd() {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260425);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const FIRST = ['Alice','Ben','Carmen','David','Elena','Farah','George','Hana','Ivan','Jiya','Kofi','Lena','Mateo','Naomi','Omar','Priya','Quinn','Rohan','Sara','Tomas','Uma','Vikram','Wren','Xiomara','Yusuf','Zoe','Aria','Marcus','Tess','Owen','Iris','Felix','Nadia','Theo'];
const LAST  = ['Chen','Becker','Ortiz','Kowalski','Park','Hassan','Singh','Liu','Costa','Tanaka','Mensah','Walsh','Romano','Ahmed','Iyer','Novak','Fernandez','Khan','Reyes','Muller','Krishnan','Sato','Petrova','Diallo','Okafor','Schmidt','Bauer','Russo'];
const usedNames = new Set();
function makeName() {
  for (let i = 0; i < 50; i++) {
    const n = `${pick(FIRST)} ${pick(LAST)}`;
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
  return `Person ${usedNames.size + 1}`;
}

const PROFILES = {
  overworked: {
    pendingPerPerson: [12, 22], resolvedPerPerson: [4, 8],
    complexityPending: [6, 10], complexityResolved: [5, 9],
    ageDaysPending:    [2, 18],
    resolveHPerC:      [1.3, 2.2],
    inboundRatio:      0.78,
    weights: { complexityHigh: 0.7 },
  },
  underused: {
    pendingPerPerson: [0, 3], resolvedPerPerson: [9, 16],
    complexityPending: [1, 5], complexityResolved: [2, 6],
    ageDaysPending:    [0, 4],
    resolveHPerC:      [0.35, 0.7],
    inboundRatio:      0.55,
    weights: { complexityHigh: 0.1 },
  },
  mixed: {
    pendingPerPerson: [4, 9], resolvedPerPerson: [7, 11],
    complexityPending: [3, 9], complexityResolved: [3, 8],
    ageDaysPending:    [0, 9],
    resolveHPerC:      [0.65, 1.2],
    inboundRatio:      0.6,
    weights: { complexityHigh: 0.35 },
  },
  healthy: {
    pendingPerPerson: [3, 6], resolvedPerPerson: [10, 15],
    complexityPending: [2, 7], complexityResolved: [3, 7],
    ageDaysPending:    [0, 6],
    resolveHPerC:      [0.5, 0.95],
    inboundRatio:      0.55,
    weights: { complexityHigh: 0.2 },
  },
  spike: {
    /* Most pending items are < 4 days old (a recent incident). */
    pendingPerPerson: [5, 11], resolvedPerPerson: [6, 10],
    complexityPending: [4, 9], complexityResolved: [3, 7],
    ageDaysPending:    [0, 4],
    resolveHPerC:      [0.7, 1.4],
    inboundRatio:      0.7,
    weights: { complexityHigh: 0.45 },
  },
  hidden: {
    pendingPerPerson: [1, 3], resolvedPerPerson: [2, 5],
    complexityPending: [3, 6], complexityResolved: [3, 6],
    ageDaysPending:    [0, 6],
    resolveHPerC:      [0.6, 1.0],
    inboundRatio:      0.5,
    weights: { complexityHigh: 0.2 },
  },
};

/* Maldistribution: index 0 = rockstar drowning; index 1 = lieutenant; rest = light. */
function maldistributedScale(memberIndex) {
  if (memberIndex === 0) return 4.0;
  if (memberIndex === 1) return 1.4;
  return 0.25;
}

const DEPARTMENTS = [
  { id: 'sal', name: 'Sales',         profile: 'overworked',     headcount: 9,
    roles: ['Account Executive','SDR','Account Manager','Sales Engineer','Enterprise AE','Channel Manager'],
    topics: ['proposal','renewal','RFP','demo','discovery call','pricing approval','contract redline','enterprise lead','quarterly review','expansion deal','MSA review','onboarding kickoff'] },
  { id: 'eng', name: 'Engineering',   profile: 'mixed',          headcount: 8,
    roles: ['Backend Engineer','Frontend Engineer','Platform Engineer','SRE','Mobile Engineer','Eng Manager'],
    topics: ['auth migration','build pipeline','flaky test','prod incident postmortem','library upgrade','feature flag rollout','API rate limit fix','schema migration','release cut','Slack alert tuning','perf regression','code review backlog'] },
  { id: 'ds',  name: 'Data Science',  profile: 'maldistributed', headcount: 6,
    roles: ['Senior DS','Data Scientist','ML Engineer','Analyst','Research Scientist'],
    topics: ['churn model','funnel analysis','attribution review','A/B test readout','dashboard rebuild','forecasting model','data pipeline backfill','feature store ingest','SQL audit','executive metrics ask'] },
  { id: 'ops', name: 'Operations',    profile: 'spike',          headcount: 7,
    roles: ['Ops Manager','Ops Analyst','Procurement Lead','Vendor Manager','Office Lead','Finance Ops'],
    topics: ['vendor onboarding','expense reconciliation','badge access issue','office incident response','procurement approval','invoice dispute','contractor renewal','headcount audit','audit prep','compliance follow-up','urgent travel rebooking'] },
  { id: 'mkt', name: 'Marketing',     profile: 'healthy',        headcount: 7,
    roles: ['Brand Lead','Content Strategist','Demand Gen Manager','Designer','PR Lead','Events Lead'],
    topics: ['blog post review','launch campaign','event sponsorship','newsletter draft','press kit','rebrand asset','SEO audit','customer story','webinar prep','design review','social calendar'] },
  { id: 'prd', name: 'Product',       profile: 'underused',      headcount: 6,
    roles: ['PM','Senior PM','Group PM','Product Designer','UX Researcher'],
    topics: ['user interview synthesis','spec review','quarterly roadmap','feature kickoff','beta feedback triage','competitive teardown','OKR rewrite','design critique','pricing experiment'] },
  { id: 'cal', name: 'Program Office', profile: 'hidden',         headcount: 2,
    roles: ['Program Manager','Chief of Staff'],
    topics: ['exec offsite','board prep','OKR aggregation','company calendar'] },
];

let nextRid = 1000;
let nextReqId = 100;
const rid = () => `r_${nextRid++}`;
const requesterId = () => `req_${nextReqId++}`;

function makeRequest({ assigneeId, deptTopics, profile, kind, scaleHours, profileName }) {
  const isResolved = kind === 'resolved';
  const direction = rnd() < profile.inboundRatio ? 'inbound' : 'outbound';
  const cplxRange = isResolved ? profile.complexityResolved : profile.complexityPending;
  let complexity = between(cplxRange[0], cplxRange[1]);
  if (rnd() < profile.weights.complexityHigh) complexity = Math.min(10, complexity + between(1, 2));

  const topic = pick(deptTopics);
  const description = `${capitalize(topic)} (${direction})`;

  /* Pending: skew older for overworked depts, fresh for spike. */
  const ageDays = isResolved
    ? rnd() * 28 + 0.2
    : profileName === 'overworked' && rnd() < 0.3
      ? 12 + rnd() * 8                                  // tail of really-old items
      : profile.ageDaysPending[0] + rnd() * (profile.ageDaysPending[1] - profile.ageDaysPending[0]);

  const created_at = new Date(NOW.getTime() - ageDays * DAY);

  /* Started = a short delay after created. ~30% of pending items haven't started yet. */
  const startedDelayH = rnd() * 6;
  const started_at = isResolved || rnd() < 0.7
    ? new Date(created_at.getTime() + startedDelayH * 3600_000)
    : null;

  let finished_at = null;
  let processHours = null;
  if (isResolved) {
    const baseHpC = scaleHours[0] + rnd() * (scaleHours[1] - scaleHours[0]);
    processHours = round1(baseHpC * Math.max(1, complexity));
    finished_at = new Date(started_at.getTime() + processHours * 3600_000);
  }

  return {
    id: rid(),
    requester_id: requesterId(),
    assignee_id: assigneeId,
    description,
    direction,
    complexity,
    created_at: created_at.toISOString(),
    started_at: started_at ? started_at.toISOString() : null,
    finished_at: finished_at ? finished_at.toISOString() : null,
    timestamp: (finished_at || started_at || created_at).toISOString(),
    processHours,
    status: isResolved ? 'resolved' : 'pending',
  };
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function round1(n) { return Math.round(n * 10) / 10; }

const out = { departments: [] };

for (const dept of DEPARTMENTS) {
  /* maldistributed depts use the 'mixed' profile shape but with per-member scaling. */
  const profileKey = dept.profile === 'maldistributed' ? 'mixed' : dept.profile;
  const profile = PROFILES[profileKey];
  const members = [];
  for (let i = 0; i < dept.headcount; i++) {
    const memberId = `m_${dept.id}_${i + 1}`;
    const role = pick(dept.roles);
    const name = makeName();
    const scale = dept.profile === 'maldistributed' ? maldistributedScale(i) : 1;

    const pendingTarget  = Math.max(0, Math.round(between(profile.pendingPerPerson[0],  profile.pendingPerPerson[1])  * scale));
    const resolvedTarget = Math.max(0, Math.round(between(profile.resolvedPerPerson[0], profile.resolvedPerPerson[1]) * Math.max(0.4, scale)));

    const requests = [];
    for (let k = 0; k < pendingTarget; k++) {
      requests.push(makeRequest({ assigneeId: memberId, deptTopics: dept.topics, profile, kind: 'pending', scaleHours: profile.resolveHPerC, profileName: dept.profile }));
    }
    for (let k = 0; k < resolvedTarget; k++) {
      requests.push(makeRequest({ assigneeId: memberId, deptTopics: dept.topics, profile, kind: 'resolved', scaleHours: profile.resolveHPerC, profileName: dept.profile }));
    }

    members.push({ id: memberId, name, role, department_id: dept.id, requests });
  }
  out.departments.push({ id: dept.id, name: dept.name, members });
}

fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));

/* Story sanity check. */
let total = 0, resolved = 0, pending = 0;
for (const d of out.departments) {
  let dpend = 0, dres = 0, oldest = 0;
  for (const m of d.members) {
    for (const r of m.requests) {
      total++;
      if (r.status === 'pending') {
        pending++; dpend++;
        const ageD = (NOW - new Date(r.created_at)) / DAY;
        if (ageD > oldest) oldest = ageD;
      } else { resolved++; dres++; }
    }
  }
  console.log(`${d.id.padEnd(4)} ${d.name.padEnd(16)} pending=${String(dpend).padStart(3)}  resolved=${String(dres).padStart(3)}  oldest=${oldest.toFixed(1)}d`);
}
console.log(`\nTOTAL  pending=${pending}  resolved=${resolved}  all=${total}`);
console.log(`Wrote ${OUT_PATH}`);
