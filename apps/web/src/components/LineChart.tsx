export interface Series { label: string; values: number[]; color: string; dashed?: boolean }

interface Props {
  months: string[];              // x labels (YYYY-MM), one per value
  series: Series[];
  baseline?: { value: number; label: string };
  yFormat: (v: number) => string;
  height?: number;
  yMin?: number;
  /** YYYY-MM to mark as "now" */
  now?: string;
  /** index at which to mark the end of the shock */
  endIndex?: number;
}

const W = 320, PAD = { l: 44, r: 8, t: 8, b: 22 };

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(m) - 1] ?? m} ${y!.slice(2)}`;
}

function niceTicks(min: number, max: number, n = 4): number[] {
  if (max === min) return [min];
  const span = max - min;
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** Line chart with a month axis, a value axis, and an optional dashed reference baseline. */
export function LineChart({ months, series, baseline, yFormat, height = 150, yMin, now, endIndex }: Props) {
  const n = months.length;
  if (n === 0) return null;
  const all = series.flatMap((s) => s.values).concat(baseline ? [baseline.value] : []);
  let min = Math.min(...all), max = Math.max(...all);
  if (yMin !== undefined) min = Math.min(min, yMin);
  if (max === min) max = min + 1;
  const range = max - min;
  min -= range * 0.05; max += range * 0.08;
  const H = height;
  const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
  const path = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ticks = niceTicks(min, max, 4);
  const every = n <= 8 ? 1 : n <= 16 ? 3 : n <= 30 ? 6 : 12;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" style={{ width: '100%', height, display: 'block' }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={PAD.l - 6} y={y(t) + 3} className="tick" textAnchor="end">{yFormat(t)}</text>
        </g>
      ))}
      {months.map((m, i) => (i % every === 0 || i === n - 1) && (
        <text key={m} x={x(i)} y={H - 6} className="tick" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{monthLabel(m)}</text>
      ))}
      {now && months.includes(now) && (
        <g>
          <line x1={x(months.indexOf(now))} x2={x(months.indexOf(now))} y1={PAD.t} y2={H - PAD.b} className="now" />
          <text x={x(months.indexOf(now)) + 3} y={PAD.t + 9} className="tick">now</text>
        </g>
      )}
      {endIndex !== undefined && endIndex > 0 && endIndex < n && (
        <text x={x(endIndex)} y={PAD.t + 9} className="tick" textAnchor="end">shock ends</text>
      )}
      {baseline && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(baseline.value)} y2={y(baseline.value)} className="baseline" />
          <text x={W - PAD.r} y={y(baseline.value) - 4} className="tick" textAnchor="end">{baseline.label}</text>
        </g>
      )}
      {series.map((s) => (
        <path key={s.label} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.5 : 2} strokeDasharray={s.dashed ? '4 3' : undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      ))}
      <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} className="axis" />
      <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="axis" />
    </svg>
  );
}
