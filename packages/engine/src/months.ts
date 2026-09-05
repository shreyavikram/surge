// packages/engine/src/months.ts
export function parseYM(ym: string): { y: number; m: number } {
  const [ys, ms] = ym.split('-');
  const y = Number(ys), m = Number(ms);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) throw new Error(`bad month ${ym}`);
  return { y, m };
}
export function addMonths(ym: string, n: number): string {
  const { y, m } = parseYM(ym);
  const total = y * 12 + (m - 1) + n;
  const yy = Math.floor(total / 12), mm = (total % 12) + 1;
  return `${yy}-${String(mm).padStart(2, '0')}`;
}
export function monthIndex(start: string, ym: string): number {
  const a = parseYM(start), b = parseYM(ym);
  return (b.y - a.y) * 12 + (b.m - a.m);
}
export function monthRange(start: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonths(start, i));
}
