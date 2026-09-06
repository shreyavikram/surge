import type { AreaHeat } from '@surge/engine';

export const NEUTRAL = '#8a94a6';

export const HEAT_RAMP: Record<AreaHeat['status'], [string, string]> = {
  stable: ['#d7ecdf', '#0d5a37'],
  anticipated: ['#fff1b8', '#a37a00'],
  unstable: ['#ffd4d4', '#7a0000'],
};

function hex(c: string): [number, number, number] { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hex(a), [r2, g2, b2] = hex(b);
  const k = Math.max(0, Math.min(1, t));
  const f = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, '0');
  return `#${f(r1, r2)}${f(g1, g2)}${f(b1, b2)}`;
}
export function heatColor(h: AreaHeat | undefined): string {
  if (!h) return HEAT_RAMP.stable[0];
  const [lo, hi] = HEAT_RAMP[h.status];
  return mix(lo, hi, h.intensity);
}
