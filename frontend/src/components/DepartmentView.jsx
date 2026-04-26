import { useMemo, useState } from 'react';
import ScoreBox from './ScoreBox';
import StatStrip from './StatStrip';
import { SCORE_COLORS, SCORE_BADGE_TEXT, heatColorForFraction, heatColorForResolve } from '../utils/scoring';
import { fmtResolveSpeed, fmtAvgHours, initials } from '../utils/format';
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
    () => dept.members.map(m => m.avgHoursPerItem).filter(v => v != null),
    [dept.members],
  );

  const cols = [
    { key: null, label: '' },
    { key: 'name', label: 'Name' },
    { key: 'role', label: 'Role' },
    { key: 'pendingCount', label: 'Open requests', align: 'center' },
    { key: 'avgComplexityPending', label: 'Avg complexity', align: 'center' },
    { key: 'oldestPendingDays', label: 'Oldest open (days)', align: 'center' },
    { key: 'throughput7d', label: 'Closed this week', align: 'center' },
    { key: 'avgHoursPerItem', label: 'Hours per item', align: 'center' },
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
          { label: 'Burden score', value: Number(dept.deptScore).toFixed(1), bg: SCORE_COLORS[Math.min(5, Math.max(1, Math.round(dept.deptScore)))], fg: SCORE_BADGE_TEXT[Math.min(5, Math.max(1, Math.round(dept.deptScore)))] ?? '#fff' },
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
            const pendingT = member.pendingCount / maxPending;
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
                <td style={{ ...TABLE_TD, textAlign: 'center', background: heatColorForFraction(pendingT), fontFamily: MONO_STACK }}>
                  {member.pendingCount}
                </td>
                <td style={{ ...TABLE_TD, textAlign: 'center', fontFamily: MONO_STACK }}>
                  {member.pendingCount > 0 ? (member.avgComplexityPending || 0).toFixed(1) : '—'}
                </td>
                <td style={{ ...TABLE_TD, textAlign: 'center', fontFamily: MONO_STACK }}>
                  {member.pendingCount > 0 && member.oldestPendingDays != null
                    ? member.oldestPendingDays.toFixed(1)
                    : '—'}
                </td>
                <td style={{ ...TABLE_TD, textAlign: 'center', fontFamily: MONO_STACK, color: (member.throughput7d ?? 0) > 0 ? '#166534' : COLORS.textFaint, fontWeight: 600 }}>
                  {member.throughput7d ?? 0}
                </td>
                <td style={{ ...TABLE_TD, textAlign: 'center', fontFamily: MONO_STACK, background: heatColorForResolve(member.avgHoursPerItem, allResolves), color: COLORS.textMuted }}>
                  {fmtAvgHours(member.avgHoursPerItem)}
                </td>
                {(() => { const b = Math.min(5, Math.max(1, Math.round(member.burdenScore))); return (
                <td style={{ ...TABLE_TD, textAlign: 'center', background: SCORE_COLORS[b], color: SCORE_BADGE_TEXT[b] ?? '#fff', fontWeight: 800, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                  {Number(member.burdenScore).toFixed(1)}
                </td>
                ); })()}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
