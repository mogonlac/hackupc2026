import { SCORE_COLORS } from '../utils/scoring';

/**
 * Compact 5-column histogram of how many people sit in each burden bucket.
 * Replaces the flat single-bar gauge for the load-balance panel.
 */
export default function Distribution({ counts, height = 84 }) {
  const max = Math.max(1, ...counts);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height, width: '100%' }}>
      {counts.map((c, i) => {
        const score = i + 1;
        const frac = c / max;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
            <div style={{ fontSize: 10, color: '#333', fontWeight: 700, marginBottom: 2, fontVariantNumeric: 'tabular-nums' }}>
              {c}
            </div>
            <div style={{
              flex: 1,
              width: '100%',
              maxWidth: 28,
              background: 'rgba(0,0,0,0.05)',
              borderRadius: 3,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              minHeight: 0,
            }}>
              <div
                title={`${c} at score ${score}`}
                style={{
                  height: `${Math.max(c > 0 ? 6 : 0, frac * 100)}%`,
                  background: SCORE_COLORS[score],
                  borderRadius: 3,
                  transition: 'height 200ms ease-out',
                }}
              />
            </div>
            <div style={{ fontSize: 9, color: '#555', marginTop: 4, fontWeight: 600 }}>{score}</div>
          </div>
        );
      })}
    </div>
  );
}
