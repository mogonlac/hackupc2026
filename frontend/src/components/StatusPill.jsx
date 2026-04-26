export const STATUS_STYLE = {
  resolved:    { bg: '#16a34a', fg: '#fff' },
  merged:      { bg: '#16a34a', fg: '#fff' },
  in_progress: { bg: '#E24B4A', fg: '#fff' },
  accepted:    { bg: '#E24B4A', fg: '#fff' },
  pending:     { bg: '#94a3b8', fg: '#fff' },
  denied:      { bg: '#1e293b', fg: '#fff' },
  sent_back:   { bg: '#1e293b', fg: '#fff' },
};

export default function StatusPill({ status }) {
  const s = STATUS_STYLE[status] ?? { bg: '#94a3b8', fg: '#fff' };
  return (
    <span style={{
      display: 'inline-block',
      minWidth: 14, height: 18,
      padding: '0 7px',
      borderRadius: 3,
      background: s.bg,
      color: s.fg ?? 'transparent',
      fontSize: 10, fontWeight: 700, lineHeight: '18px',
      textTransform: 'uppercase', letterSpacing: '0.04em',
      userSelect: 'none',
    }}>
      {s.fg ? status.replace('_', ' ') : '   '}
    </span>
  );
}
