import { useMemo } from 'react';
import ScoreBox from './ScoreBox';
import StatStrip from './StatStrip';
import Sparkline from './Sparkline';
import { SCORE_COLORS, heatColorForFraction, heatColorForResolve } from '../utils/scoring';
import { fmtAvgHours } from '../utils/format';
import { COLORS, MONO_STACK, TABLE_BASE, TABLE_TH, TABLE_TD } from '../utils/theme';

const C = { textAlign: 'center' };

export default function CompanyView({ data, onDeptClick }) {
  const departments = data.visibleDepartments;
  const { company } = data;

  const maxPending = useMemo(
    () => Math.max(1, ...departments.map(d => d.pendingTotal)),
    [departments],
  );
  const allAvgHours = useMemo(
    () => departments.map(d => d.avgHoursPerItem).filter(v => v != null),
    [departments],
  );

  const COLS = [
    { label: 'Department',         width: 120, align: 'left'   },
    { label: 'People',             width: 64,  align: 'center' },
    { label: 'Overloaded',         width: 86,  align: 'center' },
    { label: 'Underutilised',      width: 96,  align: 'center' },
    { label: 'Open requests',      width: 96,  align: 'center' },
    { label: 'Closed today',       width: 88,  align: 'center' },
    { label: 'Avg hours / item',   width: 100, align: 'center' },
    { label: 'Avg complexity',     width: 96,  align: 'center' },
    { label: '14-day trend',       width: 110, align: 'center' },
    { label: 'Score',              width: 60,  align: 'center' },
  ];

  return (
    <div style={{ padding: '0 12px 24px' }}>
      <StatStrip stats={[
        { label: 'Open requests',    value: company.pendingTotal },
        { label: 'Overloaded',       value: company.overburdenedHeadcount, color: SCORE_COLORS[5] },
        { label: 'Underutilised',    value: company.underburdenedHeadcount, color: SCORE_COLORS[2] },
        { label: 'Closed today',     value: company.closedToday ?? 0 },
        { label: 'Avg hours / item', value: fmtAvgHours(company.avgHoursPerItem) },
        { label: 'Avg complexity',   value: company.avgComplexityAll != null ? company.avgComplexityAll.toFixed(1) : '—' },
        { label: 'Burden score',     value: <ScoreBox value={company.score} title="Organisation average (1 = underloaded · 3 = balanced · 5 = overloaded)" /> },
      ]} />

      <table style={{ ...TABLE_BASE, tableLayout: 'fixed', width: '100%' }}>
        <colgroup>
          {COLS.map(c => <col key={c.label} style={{ width: c.width }} />)}
        </colgroup>
        <thead>
          <tr style={{ background: COLORS.bgHeader }}>
            {COLS.map(col => (
              <th
                key={col.label}
                style={{ ...TABLE_TH, textAlign: col.align, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {departments.map((dept, i) => {
            const pendingT = dept.pendingTotal / maxPending;
            const avgC = dept.avgComplexityAll;
            return (
              <tr
                key={dept.id}
                style={{ background: i % 2 === 0 ? COLORS.bg : COLORS.bgAlt, cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = COLORS.bgHover; }}
                onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? COLORS.bg : COLORS.bgAlt; }}
                onClick={() => onDeptClick(dept)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDeptClick(dept); } }}
                tabIndex={0}
                role="button"
                aria-label={`Open ${dept.name} department`}
              >
                {/* Department — left only */}
                <td style={{ ...TABLE_TD, fontWeight: 600, color: COLORS.link, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {dept.name}
                </td>
                {/* People */}
                <td style={{ ...TABLE_TD, ...C, fontFamily: MONO_STACK }}>
                  {dept.headcount}
                </td>
                {/* Overloaded */}
                <td style={{ ...TABLE_TD, ...C, color: dept.overburdened > 0 ? SCORE_COLORS[5] : COLORS.text, fontWeight: dept.overburdened > 0 ? 700 : 400, fontFamily: MONO_STACK }}>
                  {dept.overburdened}
                </td>
                {/* Underutilised */}
                <td style={{ ...TABLE_TD, ...C, color: dept.underburdened > 0 ? SCORE_COLORS[2] : COLORS.text, fontFamily: MONO_STACK }}>
                  {dept.underburdened}
                </td>
                {/* Open requests */}
                <td style={{ ...TABLE_TD, ...C, background: heatColorForFraction(pendingT), fontFamily: MONO_STACK }}>
                  {dept.pendingTotal}
                </td>
                {/* Closed today */}
                <td style={{ ...TABLE_TD, ...C, fontFamily: MONO_STACK, color: (dept.closedToday ?? 0) > 0 ? '#166534' : COLORS.textFaint, fontWeight: (dept.closedToday ?? 0) > 0 ? 700 : 400 }}>
                  {dept.closedToday ?? 0}
                </td>
                {/* Avg hours per item */}
                <td style={{ ...TABLE_TD, ...C, fontFamily: MONO_STACK, background: heatColorForResolve(dept.avgHoursPerItem, allAvgHours), color: COLORS.textMuted }}>
                  {fmtAvgHours(dept.avgHoursPerItem)}
                </td>
                {/* Avg complexity */}
                <td style={{ ...TABLE_TD, ...C, fontFamily: MONO_STACK }}>
                  {avgC != null ? avgC.toFixed(1) : '—'}
                </td>
                {/* 14-day trend */}
                <td style={{ ...TABLE_TD, ...C }}>
                  <Sparkline
                    values={dept.trend14}
                    width={96}
                    height={22}
                    title={`${dept.name} open items, last 14 days`}
                  />
                </td>
                {/* Score */}
                <td style={{ ...TABLE_TD, ...C }}>
                  <ScoreBox value={dept.deptScore} title={dept.name} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
