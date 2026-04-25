import { AGING_LABELS, AGING_COLORS } from '../utils/scoring';
import { TNUM } from '../utils/theme';

/**
 * series: [{ label, fullLabel?, buckets: [n,n,n,n,n] }]   — multiple rows compared
 * or a single { buckets } when only one entity is in view.
 */
export default function AgingChart({ series }) {
  if (!series || series.length === 0) {
    return <div style={{ fontSize: 12, color: '#888', textAlign: 'center', padding: 16 }}>No pending items in this view.</div>;
  }

  const totals = series.map(s => s.buckets.reduce((a, b) => a + b, 0));
  const maxTotal = Math.max(1, ...totals);
  /* For visual comparison we use absolute width = bucket / maxTotal — so a small dept's
   * stale tail looks small next to a big dept's, which is what you want for triage. */

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center', marginBottom: 2 }}>
        {AGING_LABELS.map((l, i) => (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#555', fontSize: 10 }}>
            <span style={{ width: 9, height: 9, background: AGING_COLORS[i], borderRadius: 1 }} />
            {l}
          </span>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {series.map((row, i) => {
          const total = totals[i];
          return (
            <div
              key={i}
              title={row.fullLabel || row.label}
              style={{ display: 'grid', gridTemplateColumns: '90px 1fr 38px', gap: 8, alignItems: 'center' }}
            >
              <div style={{
                fontSize: 11, fontWeight: 600, color: '#333',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {row.label}
              </div>
              <div style={{
                display: 'flex', height: 16, borderRadius: 2,
                background: 'rgba(0,0,0,0.04)', overflow: 'hidden',
                width: `${(total / maxTotal) * 100}%`, minWidth: total > 0 ? 12 : 0,
              }}>
                {row.buckets.map((n, bi) => n > 0 ? (
                  <div
                    key={bi}
                    title={`${AGING_LABELS[bi]}: ${n}`}
                    style={{ flex: n, background: AGING_COLORS[bi], minWidth: 2 }}
                  />
                ) : null)}
              </div>
              <div style={{ fontSize: 11, color: '#444', textAlign: 'right', ...TNUM, fontWeight: 600 }}>{total}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
