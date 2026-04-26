import { COLORS, LABEL, STAT_VALUE } from '../utils/theme';

/**
 * stats: [{ label, value, color?, title? }]
 */
export default function StatStrip({ stats, dense = false }) {
  return (
    <div style={{
      display: 'flex',
      borderBottom: `1px solid ${COLORS.border}`,
      background: COLORS.bgPanel,
      borderRadius: '4px 4px 0 0',
    }}>
      {stats.map((s, i) => (
        <div
          key={i}
          title={s.title}
          style={{
            flex: 1,
            padding: dense ? '10px 14px' : '14px 18px',
            borderRight: i < stats.length - 1 ? '1px solid rgba(0,0,0,0.08)' : 'none',
            minWidth: 0,
            textAlign: 'center',
            background: s.bg ?? 'transparent',
          }}
        >
          <div style={{ ...LABEL, marginBottom: 3, color: s.bg ? (s.fg ?? '#fff') : undefined }}>{s.label}</div>
          <div style={{ ...STAT_VALUE, color: s.bg ? (s.fg ?? '#fff') : (s.color ?? COLORS.text), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
