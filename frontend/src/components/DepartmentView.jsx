import { useMemo, useState } from 'react';
import ScoreBox from './ScoreBox';
import StatStrip from './StatStrip';
import { SCORE_COLORS, SCORE_BADGE_TEXT, findRedistributeMatch, heatColorForFraction, heatColorForResolve } from '../utils/scoring';
import { fmtResolveSpeed, initials } from '../utils/format';
import { COLORS, MONO_STACK, TABLE_BASE, TABLE_TH, TABLE_TD, TNUM } from '../utils/theme';

export default function DepartmentView({ dept, onMemberClick }) {
  const [sortKey, setSortKey] = useState('burdenScore');
  const [sortDir, setSortDir] = useState(-1);

  function handleSort(key) {
    if (!key) return;
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(-1); }
  }

  const sorted = useMemo(() => {
    return [...dept.members].sort((a, b) => {
      const av = a[sortKey] ?? (typeof a[sortKey] === 'string' ? '' : 0);
      const bv = b[sortKey] ?? (typeof b[sortKey] === 'string' ? '' : 0);
      if (typeof av === 'string') return av.localeCompare(bv) * sortDir;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * sortDir;
    });
  }, [dept.members, sortKey, sortDir]);

  const overloaded = dept.members.filter(m => m.burdenScore === 4 || m.burdenScore === 5).length;
  const capacity = dept.members.filter(m => m.burdenScore === 1 || m.burdenScore === 2).length;

  const maxPending = useMemo(
    () => Math.max(1, ...dept.members.map(m => m.pendingCount)),
    [dept.members],
  );
  const allResolves = useMemo(
    () => dept.members.map(m => m.resolveSpeedHPerC).filter(v => v != null),
    [dept.members],
  );

  const cols = [
    { key: null, label: '' },
    { key: 'name', label: 'Name' },
    { key: 'role', label: 'Role' },
    { key: 'pendingCount', label: 'Open requests', align: 'right' },
    { key: 'avgComplexityPending', label: 'Avg complexity', align: 'right' },
    { key: 'oldestPendingDays', label: 'Oldest open (days)', align: 'right' },
    { key: 'throughput7d', label: 'Closed this week', align: 'right' },
    { key: 'resolveSpeedHPerC', label: 'Hours per item', align: 'right' },
    { key: null, label: 'vs team' },
    { key: null, label: '2-week trend' },
    { key: null, label: 'Rebalance hint' },
    { key: 'burdenScore', label: 'Score', align: 'center' },
  ];

  return (
    <div style={{ padding: '0 12px 24px' }}>
      <StatStrip
        dense
        stats={[
          { label: 'Team', value: dept.name },
          { label: 'Open requests', value: dept.pendingTotal },
          { label: 'Overloaded', value: overloaded, color: SCORE_COLORS[5] },
          { label: 'Has capacity', value: capacity, color: SCORE_COLORS[2] },
          { label: 'People', value: dept.headcount },
          { label: 'Closed this week', value: dept.throughput7d ?? 0 },
          { label: 'Hours per item', value: fmtResolveSpeed(dept.resolveSpeed) },
          { label: 'Burden score', value: <ScoreBox value={dept.deptScore} title="Team mean (1–5)" /> },
        ]}
      />

      <table style={TABLE_BASE}>
        <thead>
          <tr style={{ background: COLORS.bgHeader }}>
            {cols.map((col, i) => {
              const active = col.key && sortKey === col.key;
              const ariaSort = active
                ? (sortDir === 1 ? 'ascending' : 'descending')
                : (col.key ? 'none' : undefined);
              return (
                <th
                  key={i}
                  onClick={() => handleSort(col.key)}
                  aria-sort={ariaSort}
                  style={{
                    ...TABLE_TH,
                    textAlign: col.align ?? 'left',
                    cursor: col.key ? 'pointer' : 'default',
                  }}
                >
                  {col.label}
                  {active && <span style={{ marginLeft: 4, fontSize: 9, color: COLORS.link }}>{sortDir === -1 ? '▼' : '▲'}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((member, i) => {
            const init = initials(member.name);
            const hint = (member.burdenScore === 5)
              ? findRedistributeMatch(member, dept.members)
              : null;
            const pendingT = member.pendingCount / maxPending;
            const dTeam = member.burdenScore - (dept.deptScore || 0);
            const traj = member.workloadTrajectory || 'stable';
            const trajC = traj === 'rising' ? '#c2410c' : traj === 'falling' ? '#166534' : '#64748b';
            return (
              <tr
                key={member.id}
                style={{
                  background: i % 2 === 0 ? COLORS.bg : COLORS.bgAlt,
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = COLORS.bgHover; }}
                onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? COLORS.bg : COLORS.bgAlt; }}
                onClick={() => onMemberClick(member)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMemberClick(member); } }}
                tabIndex={0}
                role="button"
                aria-label={`Open profile for ${member.name}`}
              >
                <td style={{ ...TABLE_TD, padding: '4px 8px' }}>
                  <span style={{
                    display: 'inline-flex', width: 26, height: 26, borderRadius: 2,
                    alignItems: 'center', justifyContent: 'center',
                    background: SCORE_COLORS[member.burdenScore],
                    color: SCORE_BADGE_TEXT[member.burdenScore] ?? '#fff',
                    fontSize: 10, fontWeight: 700, ...TNUM,
                  }}>{init}</span>
                </td>
                <td style={{ ...TABLE_TD, fontWeight: 600, color: COLORS.link }}>{member.name}</td>
                <td style={{ ...TABLE_TD, color: COLORS.textMuted }}>{member.role}</td>
                <td style={{ ...TABLE_TD, textAlign: 'right', background: heatColorForFraction(pendingT), fontFamily: MONO_STACK }}>
                  {member.pendingCount}
                </td>
                <td style={{ ...TABLE_TD, textAlign: 'right', fontFamily: MONO_STACK }}>
                  {member.pendingCount > 0 ? (member.avgComplexityPending || 0).toFixed(1) : '—'}
                </td>
                <td style={{ ...TABLE_TD, textAlign: 'right', fontFamily: MONO_STACK }}>
                  {member.pendingCount > 0 && member.oldestPendingDays != null
                    ? member.oldestPendingDays.toFixed(1)
                    : '—'}
                </td>
                <td style={{ ...TABLE_TD, textAlign: 'right', fontFamily: MONO_STACK, color: (member.throughput7d ?? 0) > 0 ? '#166534' : COLORS.textFaint, fontWeight: 600 }}>
                  {member.throughput7d ?? 0}
                </td>
                <td style={{ ...TABLE_TD, textAlign: 'right', fontFamily: MONO_STACK, background: heatColorForResolve(member.resolveSpeedHPerC, allResolves), color: COLORS.textMuted }}>
                  {fmtResolveSpeed(member.resolveSpeedHPerC)}
                </td>
                <td style={{ ...TABLE_TD, textAlign: 'right', fontFamily: MONO_STACK, fontSize: 11, color: dTeam > 0 ? '#9a3412' : dTeam < 0 ? '#1d4ed8' : COLORS.textMuted, fontWeight: 600 }} title="Burden score relative to the team average.">
                  {dTeam >= 0 ? '+' : ''}{dTeam.toFixed(1)}
                </td>
                <td style={{ ...TABLE_TD, textAlign: 'center', fontSize: 10, fontWeight: 800, textTransform: 'capitalize', color: trajC }} title="Is the open queue growing or shrinking? Compares week 1 vs week 2 of the last 14 days.">
                  {traj}
                </td>
                <td style={{ ...TABLE_TD, fontSize: 11, color: '#0f766e', maxWidth: 220 }}>
                  {hint?.text ?? '—'}
                </td>
                <td style={{ ...TABLE_TD, textAlign: 'center' }}>
                  <ScoreBox value={member.burdenScore} title={member.name} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
