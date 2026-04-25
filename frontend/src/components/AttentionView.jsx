import ScoreBox from './ScoreBox';
import Sparkline from './Sparkline';
import AgingChart from './AgingChart';
import { AGING_LABELS, AGING_COLORS } from '../utils/scoring';
import { COLORS, TNUM, MONO_STACK } from '../utils/theme';

export default function AttentionView({ data, onPersonClick, onRequestClick, onDeptClick }) {
  const vis = data.visibleDepartments;
  const all = vis.flatMap(d => d.members.map(m => ({ m, dept: d })));
  const now = data.asOf || new Date();
  const company = data.company;

  const over = [...all]
    .filter(x => x.m.burdenScore === 4 || x.m.burdenScore === 5)
    .sort((a, b) => b.m.burdenScore - a.m.burdenScore || b.m.pendingCount - a.m.pendingCount)
    .slice(0, 5);

  const under = [...all]
    .filter(x => x.m.burdenScore <= 2)
    .sort((a, b) => a.m.burdenScore - b.m.burdenScore || a.m.pendingCount - b.m.pendingCount)
    .slice(0, 5);

  const pendingRows = [];
  for (const { m, dept } of all) {
    for (const r of m.requests || []) {
      if (r.status !== 'pending') continue;
      const days = (now - new Date(r.created_at).getTime()) / 86400000;
      pendingRows.push({ m, dept, r, days });
    }
  }
  pendingRows.sort((a, b) => b.days - a.days);
  const stale = pendingRows.slice(0, 5);

  /* Department heat. Rank by score then open count. */
  const deptHeat = [...vis].sort((a, b) => b.deptScore - a.deptScore || b.pendingTotal - a.pendingTotal);
  /* Throughput leaders, last 7 days. */
  const tputRank = [...vis].sort((a, b) => (b.throughput7d ?? 0) - (a.throughput7d ?? 0));
  const maxTput = Math.max(1, ...tputRank.map(d => d.throughput7d ?? 0));
  /* Org-wide aging strip — same data the Graphing panel uses, in summary form. */
  const orgAging = company.aging;
  const orgPending = company.pendingTotal;

  /* High-complexity unassigned tail: pending items with cplx ≥ 8 not yet started. */
  const heavyUnstarted = [];
  for (const { m, dept } of all) {
    for (const r of m.requests || []) {
      if (r.status !== 'pending') continue;
      if ((r.complexity || 0) < 8) continue;
      if (r.started_at) continue;
      heavyUnstarted.push({ m, dept, r });
    }
  }
  heavyUnstarted.sort((a, b) => (b.r.complexity || 0) - (a.r.complexity || 0));
  const heavy = heavyUnstarted.slice(0, 5);

  /* Inflow vs resolved last 7d for the recent-shift card. */
  const last7 = (arr) => arr.slice(-7).reduce((a, b) => a + b, 0);
  const orgIn7 = last7(company.dailyCreated14);
  const orgOut7 = last7(company.dailyResolved14);
  const orgNet = orgOut7 - orgIn7;

  return (
    <div style={{ padding: '0 12px 32px' }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, margin: '14px 0 4px' }}>Attention</h2>
      <p style={{ fontSize: 13, color: COLORS.textMuted, margin: '0 0 16px' }}>
        Numbers are live - click anything to drill in.
      </p>

      {/* Headline strip — three quick-take numbers at the top of the page. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16,
      }}>
        <Headline label="Open requests"       value={orgPending}        sub={`${company.headcount} people`} />
        <Headline label="Overloaded"           value={company.overburdenedHeadcount} sub="score 4 or 5"
                   color={company.overburdenedHeadcount > 0 ? '#b91c1c' : undefined} />
        <Headline label="Closed this week"     value={orgOut7}           sub={`${orgIn7} created · net ${orgNet >= 0 ? '+' : ''}${orgNet}`}
                   color={orgNet >= 0 ? '#166534' : '#9a3412'} />
        <Headline label="Sitting 14+ days"     value={orgAging[4] ?? 0}  sub={`of ${orgPending} open`}
                   color={(orgAging[4] ?? 0) > 0 ? '#dc2626' : undefined} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, alignItems: 'start' }}>
        <Section bg="#fff7ed" border="#fed7aa" titleColor="#9a3412" title="Most overburdened">
          {over.length ? over.map(x => (
            <li key={x.m.id} style={{ marginBottom: 4 }}>
              <NavBtn onClick={() => onPersonClick(x.dept, x.m)}>{x.m.name}</NavBtn>
              {' '}<span style={{ color: COLORS.textFaint }}>({x.dept.name})</span>{' '}
              <ScoreBox value={x.m.burdenScore} compact />
              {' '}<span style={{ fontSize: 11, color: COLORS.textFaint, ...TNUM }}>{x.m.pendingCount} open</span>
            </li>
          )) : <li style={{ color: COLORS.textFaint }}>No one overloaded right now.</li>}
        </Section>

        <Section bg="#fef2f2" border="#fecaca" titleColor="#b91c1c" title="Most stale open work">
          {stale.length ? stale.map((x, i) => (
            <li key={`${x.r.id}-${i}`} style={{ marginBottom: 8 }}>
              <strong style={TNUM}>{x.days.toFixed(0)}d</strong> — {x.r.description.slice(0, 52)}
              {x.r.description.length > 52 ? '…' : ''}
              <br />
              <span style={{ color: COLORS.textFaint, fontSize: 11 }}>{x.m.name} · {x.dept.name}</span>
              {' '}<NavBtn onClick={() => onRequestClick(x.dept, x.m, x.r.id)} small>Open ›</NavBtn>
            </li>
          )) : <li style={{ color: COLORS.textFaint }}>No open items.</li>}
        </Section>

        <Section bg="#f0fdf4" border="#bbf7d0" titleColor="#166534" title="Capacity to redistribute">
          {under.length ? under.map(x => (
            <li key={x.m.id} style={{ marginBottom: 4 }}>
              <NavBtn onClick={() => onPersonClick(x.dept, x.m)}>{x.m.name}</NavBtn>
              {' '}<span style={{ color: COLORS.textFaint }}>({x.dept.name})</span>{' '}
              <ScoreBox value={x.m.burdenScore} compact />
              {' '}<span style={{ fontSize: 11, color: COLORS.textFaint, ...TNUM }}>{x.m.pendingCount} open</span>
            </li>
          )) : <li style={{ color: COLORS.textFaint }}>No one has spare capacity right now.</li>}
          <li style={{ listStyle: 'none', marginLeft: -18, marginTop: 8, paddingTop: 8, borderTop: '1px dashed #bbf7d0', fontSize: 11, color: '#166534', lineHeight: 1.45 }}>
                    Suggestions are within the same team. Use this as a prompt for a conversation, not an automatic reassignment.
          </li>
        </Section>
      </div>

      {/* Second row — three new high-signal cards. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 16, alignItems: 'start', marginTop: 16 }}>
        <Section bg="#fff" border="#e5e5e5" titleColor="#111" title="Departments under pressure">
          <div style={{ marginLeft: -18, fontSize: 12 }}>
            {deptHeat.length === 0 ? <div style={{ color: COLORS.textFaint }}>No departments.</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', ...TNUM }}>
                <thead>
                  <tr style={{ color: COLORS.textFaint, fontSize: 10, textTransform: 'uppercase' }}>
                    <th style={dhTh}>Department</th>
                    <th style={dhTh}>Score</th>
                    <th style={{ ...dhTh, textAlign: 'right' }}>Open</th>
                    <th style={{ ...dhTh, textAlign: 'right' }}>Closed this week</th>
                    <th style={dhTh}>14-day trend</th>
                  </tr>
                </thead>
                <tbody>
                  {deptHeat.map(d => (
                    <tr key={d.id}>
                      <td style={dhTd}>
                        <NavBtn onClick={() => onDeptClick?.(d)}>{d.name}</NavBtn>
                      </td>
                      <td style={dhTd}><ScoreBox value={d.deptScore} compact /></td>
                      <td style={{ ...dhTd, textAlign: 'right', fontFamily: MONO_STACK }}>{d.pendingTotal}</td>
                      <td style={{ ...dhTd, textAlign: 'right', fontFamily: MONO_STACK, color: (d.throughput7d ?? 0) > 0 ? '#166534' : COLORS.textFaint, fontWeight: 600 }}>{d.throughput7d ?? 0}</td>
                      <td style={dhTd}>
                        <Sparkline values={d.trend14} width={86} height={20} title={`${d.name} open items, last 14d`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Section>

        <Section bg="#fff" border="#e5e5e5" titleColor="#111" title="Backlog by age">
          <div style={{ marginLeft: -18 }}>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>
              {orgPending} open requests across the organisation. Items in red have been open for two weeks or more.
            </div>
            <AgingChart series={deptHeat.map(d => ({ label: d.name, fullLabel: d.name, buckets: d.aging }))} />
            <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 10, color: COLORS.textMuted, flexWrap: 'wrap' }}>
              {AGING_LABELS.map((l, i) => (
                <span key={l}>
                  <span style={{ display: 'inline-block', width: 9, height: 9, background: AGING_COLORS[i], marginRight: 4, verticalAlign: 'middle', borderRadius: 1 }} />
                  {l}: <strong style={TNUM}>{orgAging[i] ?? 0}</strong>
                </span>
              ))}
            </div>
          </div>
        </Section>

        <Section bg="#fff" border="#e5e5e5" titleColor="#111" title="Most completed this week">
          <div style={{ marginLeft: -18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tputRank.map(d => {
              const t = d.throughput7d ?? 0;
              const frac = t / maxTput;
              return (
                <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 30px', gap: 8, alignItems: 'center' }}>
                  <NavBtn onClick={() => onDeptClick?.(d)}>{d.name}</NavBtn>
                  <div style={{ background: 'rgba(0,0,0,0.05)', borderRadius: 2, height: 12, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(2, frac * 100)}%`, height: '100%', background: '#10b981' }} />
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: MONO_STACK, fontSize: 12, fontWeight: 600 }}>{t}</div>
                </div>
              );
            })}
            <div style={{ marginTop: 6, fontSize: 11, color: COLORS.textMuted }}>
              Requests closed in the past 7 days. A low bar next to high open requests may indicate a bottleneck.
            </div>
          </div>
        </Section>
      </div>

      {/* Third row — high-complexity unstarted items. */}
      {heavy.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Section bg="#fef3c7" border="#fde68a" titleColor="#92400e" title="High-complexity work not yet started">
            {heavy.map((x, i) => (
              <li key={`${x.r.id}-${i}`} style={{ marginBottom: 6 }}>
                <span style={{ fontFamily: MONO_STACK, fontWeight: 700, color: '#9a3412', marginRight: 6 }}>Complexity {x.r.complexity}</span>
                {x.r.description.slice(0, 64)}{x.r.description.length > 64 ? '…' : ''}
                <br />
                <span style={{ fontSize: 11, color: COLORS.textFaint }}>{x.m.name} · {x.dept.name}</span>
                {' '}<NavBtn onClick={() => onRequestClick(x.dept, x.m, x.r.id)} small>Open ›</NavBtn>
              </li>
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}

function Headline({ label, value, sub, color }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 8,
      padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color ?? COLORS.text, lineHeight: 1, ...TNUM }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: COLORS.textMuted }}>{sub}</div> : null}
    </div>
  );
}

const dhTh = { textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${COLORS.borderSoft}`, fontWeight: 600 };
const dhTd = { padding: '6px', borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 12 };

function Section({ bg, border, titleColor, title, children }) {
  return (
    <section style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: 12 }}>
      <h3 style={{ fontSize: 12, fontWeight: 800, color: titleColor, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</h3>
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}>
        {children}
      </ol>
    </section>
  );
}

function NavBtn({ onClick, children, small }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none', border: 'none', padding: 0,
        color: COLORS.link, cursor: 'pointer', textAlign: 'left',
        font: 'inherit', fontSize: small ? 11 : undefined, fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}
