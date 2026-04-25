import { TNUM } from '../utils/theme';

/**
 * Two parallel 14-day series rendered on the same grid:
 *   inflow:    items created per day        (orange line)
 *   resolved:  items closed per day         (green line)
 *
 * If `inflow` runs above `resolved` you're falling behind. The whole point of
 * the chart is to make that crossover obvious at a glance.
 */
const COL_INFLOW = '#D85A30';
const COL_RESOLVED = '#10b981';

export default function ThroughputChart({ inflow, resolved, days = 14 }) {
  const length = Math.min(inflow?.length ?? 0, resolved?.length ?? 0, days);
  if (length === 0) {
    return <div style={{ fontSize: 12, color: '#888', textAlign: 'center', padding: 16 }}>No throughput data.</div>;
  }
  const all = [...inflow, ...resolved];
  const max = Math.max(1, ...all);
  const sumIn = inflow.reduce((a, b) => a + b, 0);
  const sumOut = resolved.reduce((a, b) => a + b, 0);
  const net = sumOut - sumIn;
  const netLabel = net >= 0 ? `closed ${net} more than created` : `created ${-net} more than closed`;
  const netColor = net >= 0 ? COL_RESOLVED : COL_INFLOW;

  const W = 100, H = 100; // viewBox is rescaled
  const stepX = length > 1 ? W / (length - 1) : 0;
  const yOf = v => H - (v / max) * (H - 6) - 1;

  const buildPath = (vals) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(2)},${yOf(v).toFixed(2)}`).join(' ');
  const inflowPath = buildPath(inflow.slice(0, length));
  const resolvedPath = buildPath(resolved.slice(0, length));

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 14, fontSize: 10, marginBottom: 4, alignItems: 'baseline' }}>
        <span><span style={swatch(COL_INFLOW)} />created/day · 14d total <strong style={TNUM}>{sumIn}</strong></span>
        <span><span style={swatch(COL_RESOLVED)} />resolved/day · 14d total <strong style={TNUM}>{sumOut}</strong></span>
        <span style={{ marginLeft: 'auto', fontWeight: 700, color: netColor, ...TNUM }}>{netLabel}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block' }}>
          {[0.25, 0.5, 0.75].map(t => (
            <line key={t} x1={0} x2={W} y1={H * t} y2={H * t} stroke="rgba(0,0,0,0.06)" strokeWidth="0.3" />
          ))}
          <path d={inflowPath} fill="none" stroke={COL_INFLOW} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          <path d={resolvedPath} fill="none" stroke={COL_RESOLVED} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#888', marginTop: 4 }}>
        <span>{length}d ago</span>
        <span>today</span>
      </div>
    </div>
  );
}

function swatch(color) {
  return { display: 'inline-block', width: 9, height: 2, background: color, marginRight: 5, verticalAlign: 'middle' };
}
