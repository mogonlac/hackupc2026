/**
 * One plain-English story per scope, backed by a 0-100 "stress" blend of dashboard
 * metrics. Written for a general (e.g. HR) audience—no product jargon in user text.
 */

import { isRequestOpen } from './requestModel';
import { findRedistributeMatch, computeLoadBalancePercent } from './scoring';

/**
 * @returns {{ title: string, items: Array<{ id: string, text: string, hint?: string, nav: object | null }> }}
 */
export function buildRecommendations({ nav, data, currentDept, currentMember, now }) {
  if (nav.kind === 'company') {
    return buildCompanyNarrative(data);
  }
  if (nav.kind === 'dept' && currentDept) {
    return buildDeptNarrative(data, currentDept);
  }
  if (nav.kind === 'member' && currentMember && currentDept) {
    return buildMemberNarrative(data, currentDept, currentMember, now, nav.requestId);
  }
  return { title: '—', items: [] };
}

function clamp01(x) {
  if (x == null || Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/** Short opener for 0-100 stress (higher = more pressure). */
function stressOpener(n) {
  if (n <= 25) return 'The overall picture is fairly calm';
  if (n <= 45) return 'The overall picture is busy, but not alarm bells';
  if (n <= 65) return 'The overall picture is under real strain';
  if (n <= 80) return 'The overall picture is tight—people and teams are carrying a lot';
  return 'The overall picture is as sharp as it gets in this data';
}

function deptOpener(n) {
  if (n <= 25) return 'This team is in a steady place right now';
  if (n <= 45) return 'This team is active, with room to move work around if needed';
  if (n <= 65) return 'This team is feeling pressure—worth watching who is overloaded';
  if (n <= 80) return 'This team is stretched—rebalancing and sequencing matter here';
  return 'This team is at the edge of what the numbers suggest is sustainable';
}

function memberOpener(n) {
  if (n <= 25) return 'From what we can see, your workload is in a reasonable band';
  if (n <= 45) return 'You have a full plate, but it is not off the scale';
  if (n <= 65) return 'You are carrying a lot compared with a typical load';
  if (n <= 80) return 'You are in the heavy end of the range—time to protect focus and get help if you can';
  return 'The numbers have you in the heaviest band—rethink what must happen this week';
}

/**
 * 0-100: queue concentration, uneven sharing, old open requests, how many people are overloaded.
 */
function buildCompanyNarrative(data) {
  const vis = data.visibleDepartments || [];
  const c = data.company;
  const allPeople = vis.flatMap(d => d.members);
  const byPending = [...vis].sort((a, b) => (b.pendingTotal ?? 0) - (a.pendingTotal ?? 0));
  const lb = computeLoadBalancePercent(allPeople);
  const pending = Math.max(0, c.pendingTotal ?? 0);
  const stale = c.aging?.[4] ?? 0;
  const over = c.overburdenedHeadcount ?? 0;
  const nP = Math.max(1, allPeople.length);
  const top = byPending[0];
  const topShare = pending > 0 && top ? top.pendingTotal / pending : 0;
  const staleShare = pending > 0 ? stale / pending : 0;
  const overShare = over / nP;

  if (pending === 0) {
    return {
      title: 'ALL',
      items: [{
        id: 'company-clear',
        text: 'There are no open requests in this view right now, so the only message is: keep an eye on what lands next, so the next busy spell does not catch people off guard.',
        hint: 'We only show a stress number when there is open work in scope.',
        nav: null,
      }],
    };
  }

  const c1 = clamp01(topShare * 1.1);
  const c2 = (100 - lb.percent) / 100;
  const c3 = staleShare;
  const c4 = clamp01(overShare * 2.2);
  const stress = Math.round(100 * (0.32 * c1 + 0.28 * c2 + 0.24 * c3 + 0.16 * c4));

  const drivers = [
    { k: 'conc', s: 0.32 * c1, top, topShare },
    { k: 'spread', s: 0.28 * c2, lb },
    { k: 'stale', s: 0.24 * c3, stale, staleShare },
    { k: 'overload', s: 0.16 * c4, over, overShare },
  ].sort((a, b) => b.s - a.s);
  const [lead, follow] = drivers;

  const nav = (lead.k === 'conc' && lead.top) ? { kind: 'dept', deptId: lead.top.id } : null;

  let text = `${stressOpener(stress)}. We would put that at about ${stress} out of 100 for how much pressure the whole picture is under (0 is calm, 100 is the ceiling we ever show here). `;

  if (lead.k === 'conc' && top) {
    const pct = Math.round(lead.topShare * 100);
    text += `A big slice of the open work is sitting with ${top.name}—about ${pct}% of it.`;
  } else if (lead.k === 'spread') {
    text += 'The work is not shared out evenly: some people and teams are much busier than others, even when you look at the whole org.';
  } else if (lead.k === 'stale') {
    text += `A large share of what is still open has been open more than two weeks (about ${Math.round(staleShare * 100)}% of all open work). That usually means a mix of real blockers and “we have not found time yet.”`;
  } else {
    text += `A lot of people are already in the “very full to overloaded” range—on the order of ${(overShare * 100).toFixed(0)}% of people in this view.`;
  }

  if (follow && follow.s > 0.06 && follow.k !== lead.k) {
    if (follow.k === 'stale') {
      text += ` It also matters that ${stale} separate requests are past that two-week mark.`;
    } else if (follow.k === 'spread') {
      text += ' Sharing work more fairly between teams is still one of the cleanest levers before you add more. ';
    } else if (follow.k === 'conc' && top) {
      text += ` ${top.name} is still the single biggest pocket of open volume.`;
    } else if (follow.k === 'overload') {
      text += ` And ${over} people are already tagged as overloaded, not just “busy.”`;
    }
  }

  if (stress >= 60) {
    text += ' A good place to start: help the busiest team clear the oldest work and shift some new work to people who have more room, before the pile grows again.';
  } else if (stress >= 35) {
    text += ' A good place to start: nudge a few items across team lines so the busy pockets do not get bigger next month.';
  } else {
    text += ' A good place to start: keep an eye on anything sneaking past two weeks open, so the picture stays this manageable.';
  }

  const hint = `The ${stress} out of 100 is one number that mixes four things: how much work is stuck in one team, how evenly work is shared, how much is more than two weeks old, and how many people are overloaded—same information as the rest of the dashboard, rolled together.`;

  return { title: 'ALL', items: [{ id: 'company', text, hint, nav }] };
}

function buildDeptNarrative(_data, dept) {
  const members = dept.members || [];
  const n = Math.max(1, members.length);
  const pending = Math.max(0, dept.pendingTotal ?? 0);
  const overC = dept.overburdened ?? 0;
  const sorted = [...members].sort((a, b) => (b.burdenScore ?? 0) - (a.burdenScore ?? 0));
  const heaviest = sorted[0];
  const lightest = sorted.length ? sorted[sorted.length - 1] : null;
  const lb = computeLoadBalancePercent(members);

  if (pending === 0) {
    return {
      title: (dept.name || 'Department').toUpperCase(),
      items: [{
        id: 'dept-clear',
        text: `Nothing is open for ${dept.name || 'this team'} in this view. When it is quiet like this, the win is to protect a little headroom before the next batch of requests lands.`,
        hint: 'We need at least one open item to say much about this team’s stress.',
        nav: null,
      }],
    };
  }

  const spreadStress = (100 - lb.percent) / 100;
  const heaviestStress = heaviest
    ? clamp01(((heaviest.burdenScore ?? 3) - 2) / 3)
    : 0;
  const overStress = clamp01(overC / n);
  const massStress = clamp01(pending / (pending + 40));
  const stress = Math.round(100 * (0.3 * heaviestStress + 0.28 * spreadStress + 0.24 * overStress + 0.18 * massStress));

  let text = `${deptOpener(stress)}—about ${stress} out of 100 in the same “more pressure to less” style as the org view. `;

  const match = heaviest ? findRedistributeMatch(heaviest, members) : null;
  if (match && (heaviest.burdenScore ?? 0) >= 4) {
    text += `Most of the heat is on ${heaviest.name}, while ${match.member.name} has more room and can take similar work if you make the handover clean. `;
  } else if (heaviest && (heaviest.burdenScore ?? 0) >= 4) {
    text += `${heaviest.name} is carrying the heaviest load here, and we do not see an obvious “same kind of work, lighter load” person to pair with. That usually means a manager conversation, not a silent shuffle. `;
  } else if ((100 - lb.percent) > 35) {
    text += `The work is lumpy: some people are busier than others (we score that as ${lb}% “even” for this team, where 100% would be perfectly even). `;
  } else {
    text += `There are ${pending} open requests, and the team is busy but not wildly split. `;
  }

  if (lightest && (lightest.burdenScore ?? 0) <= 2 && (heaviest?.burdenScore ?? 0) >= 4) {
    text += `A practical next step: move a few well-defined items from the busiest people toward ${lightest.name} before the gap between “full” and “light” hardens.`;
  } else {
    text += 'A practical next step: agree what finishes first, then who picks up the next item—so the average does not keep creeping up in silence.';
  }

  const nav = match
    ? { kind: 'member', deptId: dept.id, memberId: match.member.id }
    : (heaviest ? { kind: 'member', deptId: dept.id, memberId: heaviest.id } : null);

  const hint = `The ${stress} out of 100 here mixes who is the busiest, how uneven the team is, how many people are overloaded, and how big the open list is.`;

  return {
    title: (dept.name || 'Department').toUpperCase(),
    items: [{ id: 'dept', text, hint, nav }],
  };
}

function buildMemberNarrative(_data, dept, member, now, selectedRequestId) {
  const reqs = member.requests || [];
  const open = reqs.filter(r => isRequestOpen(r));
  const others = dept.members || [];
  const m = findRedistributeMatch(member, others);

  const openN = open.length;
  if (openN === 0) {
    return {
      title: (member.name || 'Member').toUpperCase(),
      items: [{
        id: 'member-clear',
        text: 'You have no open requests here, so the only guidance is: when the next one arrives, be deliberate about when it starts, not just that it is “in the queue.”',
        hint: 'No open work in this person’s list—so no stress number.',
        nav: null,
      }],
    };
  }

  let oldest = open[0];
  let bestAge = 0;
  for (const r of open) {
    const age = (now.getTime() - new Date(r.created_at).getTime()) / 86400000;
    if (age > bestAge) {
      bestAge = age;
      oldest = r;
    }
  }
  const ageStress = clamp01(bestAge / 21);
  const burdenStress = clamp01(((member.burdenScore ?? 3) - 1) / 3.5);
  const dMean = dept.deptScore ?? 0;
  const myB = member.burdenScore ?? 0;
  const teamStress = clamp01(Math.abs(myB - dMean) / 2.2);
  const heavyUnstarted = open.find(r => (r.complexity || 0) >= 8 && !r.started_at);
  const unstartSurf = heavyUnstarted ? 0.92 : 0;

  const stress = Math.round(100 * (
    0.32 * Math.max(ageStress, unstartSurf)
    + 0.30 * burdenStress
    + 0.25 * teamStress
    + 0.13 * clamp01(openN / 10)
  ));

  const sel = selectedRequestId ? reqs.find(x => x.id === selectedRequestId) : null;
  const name = member.name || 'You';

  let text = sel
    ? `With ${sel.id} selected, the picture for ${name} is still about ${stress} out of 100 for how full and risky the week looks. `
    : `${memberOpener(stress)}—about ${stress} out of 100 on the same 0-100 “how much is on this person’s plate” idea. `;

  if (m && (member.burdenScore ?? 0) >= 5) {
    text += `${m.member.name} is the natural person to take some of the same kind of work if you are allowed to reassign, so you can get the top of the list moving. `;
  } else if (heavyUnstarted) {
    text += `There is a large, not-yet-started item (${heavyUnstarted.id || '—'}) that will dominate time if nobody breaks it into steps. `;
  } else if ((member.burdenScore ?? 0) >= 4) {
    text += 'You are already in the “very full” range, so the main idea is to finish or hand off before you add more, not to squeeze in another “small” thing. ';
  } else if (ageStress > 0.45) {
    text += `The oldest open work is on the order of ${bestAge.toFixed(0)} days—usually worth either closing, delegating, or getting a real deadline. `;
  } else {
    text += 'Nothing here looks like a crisis on paper; the main risk is old items going quiet. ';
  }

  if (dMean != null && Math.abs(myB - dMean) > 0.55 && !(m && (member.burdenScore ?? 0) >= 5)) {
    const rel = myB > dMean + 0.4 ? 'heavier' : 'lighter';
    text += `You are ${rel} than the average for this team, which is useful context if people are trying to be fair.`;
  } else {
    text += 'Sensible next step: touch the oldest or scariest item once—move it, split it, or get a name on it—then look at the list again after that.';
  }

  let nav = null;
  if (sel) {
    nav = { kind: 'member', deptId: dept.id, memberId: member.id, requestId: selectedRequestId };
  } else if (m && (member.burdenScore ?? 0) >= 5) {
    nav = { kind: 'member', deptId: dept.id, memberId: m.member.id };
  } else if (oldest) {
    nav = { kind: 'member', deptId: dept.id, memberId: member.id, requestId: oldest.id };
  }

  const hint = `The ${stress} out of 100 looks at how old the oldest open work is, how full this person is, how that compares to the team, and how many open items are on the list, plus a flag for a big unstarted item.`;

  return {
    title: (member.name || 'Member').toUpperCase(),
    items: [{ id: 'member', text, hint, nav }],
  };
}
