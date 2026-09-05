import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fred } from '../src/feeds/fred.js';

const csv = readFileSync(fileURLToPath(new URL('./fixtures/fred-eggs.csv', import.meta.url)), 'utf8');

describe('fred adapter', () => {
  it('parses a CSV series into aligned months and values', () => {
    const { series } = fred.parse(csv);
    const s = series!['APU0000708111'];
    expect(s).toBeDefined();
    expect(s!.months.length).toBe(s!.values.length);
    expect(s!.months.length).toBeGreaterThan(100);
    for (const m of s!.months.slice(0, 5)) expect(m).toMatch(/^\d{4}-\d{2}$/);
    // ascending by date
    expect(s!.months[0]! < s!.months[s!.months.length - 1]!).toBe(true);
    for (const v of s!.values) expect(Number.isFinite(v)).toBe(true);
  });
});
