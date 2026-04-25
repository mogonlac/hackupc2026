/**
 * Tiny inline SVG sparkline. `values` is a flat numeric array.
 * Renders area + line + a final dot.
 */
export default function Sparkline({ values, width = 84, height = 22, stroke = '#1a6fc4', fill = 'rgba(26,111,196,0.15)', title }) {
  if (!values || values.length === 0) {
    return <span style={{ display: 'inline-block', width, height }} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? (width - 2) / (values.length - 1) : 0;

  const pts = values.map((v, i) => {
    const x = 1 + i * stepX;
    const y = height - 1 - ((v - min) / span) * (height - 2);
    return [x, y];
  });

  const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title || 'trend'}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      {title ? <title>{title}</title> : null}
      <path d={areaPath} fill={fill} stroke="none" />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={1.6} fill={stroke} />
    </svg>
  );
}
