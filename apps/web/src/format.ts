// Display formatting only. Never computes economics — it formats engine output.

export function compactUsd(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}K`;
  return `${sign}$${a.toFixed(0)}`;
}

export function usd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function usd2(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** x is a fraction (0.147 → "14.7%"). */
export function pct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function signedPct(x: number, digits = 1): string {
  if (Math.abs(x) < 0.5 * Math.pow(10, -digits - 2)) x = 0; // no "-0.0%"
  const s = (x * 100).toFixed(digits);
  return `${x > 0 ? '+' : ''}${s}%`;
}

export function compactNum(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
  return `${sign}${a.toFixed(0)}`;
}

/** Peak (max magnitude) value of a series, for headline sparkline labels. */
export function peak(series: number[]): number {
  let best = 0;
  for (const v of series) if (Math.abs(v) > Math.abs(best)) best = v;
  return best;
}
