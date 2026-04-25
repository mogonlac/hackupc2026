export const COLORS = {
  text: '#111',
  textMuted: '#555',
  textFaint: '#888',
  link: '#1a6fc4',
  bg: '#fff',
  bgAlt: '#f7f7f7',
  bgPanel: '#f5f5f5',
  bgHeader: '#ebebeb',
  bgChrome: '#e8e8e8',
  bgHover: '#eef4ff',
  border: 'rgba(0,0,0,0.12)',
  borderSoft: 'rgba(0,0,0,0.07)',
  topBar: '#111',
  topBarText: '#fff',
  topBarMuted: '#aaa',
};

export const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
export const MONO_STACK = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export const TNUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' };

export const LABEL = {
  fontSize: 10,
  fontWeight: 600,
  color: COLORS.textFaint,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

export const STAT_VALUE = {
  fontSize: 18,
  fontWeight: 700,
  color: COLORS.text,
  ...TNUM,
};

export const PANEL_HEADER_GRADIENT = 'linear-gradient(180deg, #f5f5f5 0%, #e0e0e0 100%)';

export const TABLE_TH = {
  padding: '7px 10px',
  textAlign: 'left',
  borderBottom: `1px solid ${COLORS.border}`,
  borderRight: `1px solid ${COLORS.borderSoft}`,
  fontWeight: 600,
  fontSize: 11,
  color: '#333',
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
};

export const TABLE_TD = {
  padding: '6px 10px',
  borderBottom: `1px solid ${COLORS.borderSoft}`,
  borderRight: `1px solid ${COLORS.borderSoft}`,
  ...TNUM,
};

export const TABLE_BASE = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
  tableLayout: 'auto',
  ...TNUM,
};
