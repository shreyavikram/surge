import { describe, it, expect } from 'vitest';
import { priceAnomaly, anomalyLevel } from '../src/anomaly.js';

function series(years: number, f: (year: number, month: number) => number): { months: string[]; values: number[] } {
  const months: string[] = [];
  const values: number[] = [];
  for (let y = 0; y < years; y++) for (let m = 1; m <= 12; m++) { months.push(`${2000 + y}-${String(m).padStart(2, '0')}`); values.push(f(y, m)); }
  return { months, values };
}

describe('FAO price anomaly indicator', () => {
  it('scores a steady seasonal series as normal', () => {
    const { months, values } = series(12, (y, m) => 2 * Math.pow(1.02, y) * (1 + 0.1 * Math.sin((m / 12) * 2 * Math.PI)));
    const a = priceAnomaly(months, values)!;
    expect(a).not.toBeNull();
    expect(Math.abs(a.ifpa)).toBeLessThan(0.5);
    expect(a.level).toBe('normal');
    expect(a.weightQuarter).toBeGreaterThan(0);
    expect(a.weightQuarter).toBeLessThan(1);
  });
  it('flags a sudden 40% jump as abnormally high and a collapse as abnormally low', () => {
    const base = series(12, (y, m) => 2 * Math.pow(1.02, y) * (1 + 0.05 * Math.cos((m / 12) * 2 * Math.PI)) * (1 + 0.01 * Math.sin(y * 7 + m)));
    const up = base.values.slice();
    up[up.length - 1] = up[up.length - 1]! * 1.4;
    const a = priceAnomaly(base.months, up)!;
    expect(a.ifpa).toBeGreaterThan(1);
    expect(a.level).toBe('abnormally-high');
    const down = base.values.slice();
    down[down.length - 1] = down[down.length - 1]! * 0.6;
    expect(priceAnomaly(base.months, down)!.level).toBe('abnormally-low');
  });
  it('needs at least five same-month observations behind each growth rate', () => {
    const { months, values } = series(5, (y, m) => 1 + y + m / 100);
    // five years of data: the December in year 4 has same-month CAGR history from years 1-3 only (three values)
    expect(priceAnomaly(months, values)).toBeNull();
    const more = series(8, (y, m) => 1 + y + m / 100);
    expect(priceAnomaly(more.months, more.values)).not.toBeNull();
  });
  it('scores a named month and reports the recent path', () => {
    const { months, values } = series(10, (y, m) => 3 + 0.1 * y + 0.01 * m);
    const a = priceAnomaly(months, values, '2008-06')!;
    expect(a.month).toBe('2008-06');
    expect(a.recent.length).toBeGreaterThan(0);
    expect(a.recent[a.recent.length - 1]!.month).toBe('2008-06');
  });
  it('thresholds follow the FAO classification', () => {
    expect(anomalyLevel(1.2)).toBe('abnormally-high');
    expect(anomalyLevel(0.7)).toBe('moderately-high');
    expect(anomalyLevel(0.2)).toBe('normal');
    expect(anomalyLevel(-0.7)).toBe('moderately-low');
    expect(anomalyLevel(-1.5)).toBe('abnormally-low');
  });
});
