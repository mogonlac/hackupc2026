import { COLORS, TNUM } from '../utils/theme';

const PALETTE = [
  '#0ea5e9', '#8b5cf6', '#f97316', '#10b981', '#ec4899', '#eab308', '#14b8a6', '#f43f5e',
  '#6366f1', '#84cc16', '#d946ef', '#64748b', '#0d9488',
];

/**
 * Slices: { label, value, fullLabel? } — value = positive units (e.g. resolved counts).
 */
export default function WorkSharePie({ items, title, size = 200 }) {
  const slices = (items || []).filter(x => (x.value || 0) > 0);
  const total = slices.reduce((s, x) => s + x.value, 0);

  if (total <= 0) {
    return (
      <div style={{
        flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 12,
      }}
      >
        {title
          ? <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, alignSelf: 'stretch' }}>{title}</div>
          : null}
        <div style={{ fontSize: 12, color: COLORS.textFaint, textAlign: 'center' }}>No data to chart.</div>
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  let a0 = -Math.PI / 2;
  const pathData = slices.map((item, i) => {
    const v = item.value;
    const frac = v / total;
    const a1 = a0 + frac * 2 * Math.PI;
    /* Single 100% slice: SVG elliptical arc cannot span 360° in one path; use a filled ring. */
    if (slices.length === 1) {
      return { i, color: PALETTE[0], full: true };
    }
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
    const color = PALETTE[i % PALETTE.length];
    a0 = a1;
    return { d, i, color, full: false };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0 }}>
      {title
        ? <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{title}</div>
        : null}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 auto' }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="Work share by worker">
            {pathData.map((p) => (p.full
              ? <circle key={p.i} cx={cx} cy={cy} r={r} fill={p.color} stroke="#fff" strokeWidth={1.5} />
              : <path key={p.i} d={p.d} fill={p.color} stroke="#fff" strokeWidth={1.5} />
            ))}
            <circle cx={cx} cy={cy} r={r * 0.42} fill="#fff" />
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: 10, fontWeight: 800, fill: '#334155' }}
            >
              {`${total.toLocaleString()} items`}
            </text>
          </svg>
        </div>
        <ul style={{
          listStyle: 'none', margin: 0, padding: 0, fontSize: 10, lineHeight: 1.4,
          flex: '1 1 120px', minWidth: 0, maxHeight: 180, overflowY: 'auto',
        }}
        >
          {slices.map((item, i) => {
            const v = item.value;
            const pct = 100 * v / total;
            return (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }} title={item.fullLabel || item.label}>
                <span style={{ width: 8, height: 8, borderRadius: 1, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                <span style={{ color: '#64748b', ...TNUM, flexShrink: 0 }}>{pct.toFixed(0)}%</span>
                <span style={{ color: COLORS.textFaint, ...TNUM, fontSize: 9, flexShrink: 0 }}>({v})</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
