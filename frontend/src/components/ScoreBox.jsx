import { SCORE_COLORS, SCORE_BADGE_TEXT } from '../utils/scoring';

/**
 * 1.0–5.0 on one decimal, 5-bucket color; no label text.
 */
export default function ScoreBox({ value, compact = false, title }) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  const display = safe.toFixed(1);
  const bucket = Math.min(5, Math.max(1, Math.round(safe)));
  const bg = SCORE_COLORS[bucket] ?? '#64748b';
  const fg = SCORE_BADGE_TEXT[bucket] ?? '#fff';
  return (
    <span
      title={title ?? `Score ${display}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: compact ? 28 : 36,
        padding: compact ? '2px 6px' : '4px 10px',
        borderRadius: 4,
        background: bg,
        color: fg,
        fontSize: compact ? 10 : 13,
        fontWeight: 800,
        lineHeight: 1.2,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {display}
    </span>
  );
}
