interface Props {
  series: number[];
  counterfactual?: number[];
  color?: string;
  height?: number;
  fill?: boolean;
}

const W = 240;

/** Inline SVG sparkline. Stretches to container width; strokes stay crisp via
 * non-scaling-stroke. Optional dashed counterfactual overlay. */
export function Sparkline({ series, counterfactual, color = 'var(--accent)', height = 46, fill = true }: Props) {
  if (series.length === 0) return null;
  const all = counterfactual ? [...series, ...counterfactual, 0] : [...series, 0];
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) { min -= 1; max += 1; }
  const pad = 4;
  const H = height;
  const x = (i: number, n: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => H - pad - ((v - min) / (max - min)) * (H - 2 * pad);
  const path = (s: number[]) => s.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i, s.length).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const zeroY = y(0);
  const area = `${path(series)} L${W},${H} L0,${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      {min < 0 && max > 0 && (
        <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="var(--border-solid)" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="2 3" />
      )}
      {fill && <path d={area} fill={color} opacity={0.12} />}
      {counterfactual && (
        <path d={path(counterfactual)} fill="none" stroke="var(--text-faint)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />
      )}
      <path d={path(series)} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
