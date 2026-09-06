import { describe, it, expect } from 'vitest';
import { trade, _importDeclines as importDeclines, type TradeRaw } from '../src/feeds/trade.js';
import { priceStress, applyPriceStress } from '../src/price-stress.js';
import type { FeedItem } from '../src/feeds/types.js';

/** Synthetic Census rows: tomatoes (0702) from Mexico and Canada, bananas (0803) from Guatemala, over 39 months (three baseline years). */
function raw(): TradeRaw {
  const months: string[] = [];
  for (let k = 38; k >= 0; k--) { const d = new Date(Date.UTC(2026, 6 - k, 1)); months.push(d.toISOString().slice(0, 7)); }
  const rows: TradeRaw['rows'] = { '0702': [], '0803': [] };
  for (const m of months) {
    const recent = m >= '2026-05';
    const mex = recent ? 100e6 : 200e6;      // Mexico halves in the last three months
    const can = recent ? 100e6 : 80e6;        // Canada rises: named as the replacement
    rows['0702']!.push(['-', 'TOTAL FOR ALL COUNTRIES', mex + can, m], ['2010', 'MEXICO', mex, m], ['1220', 'CANADA', can, m], ['1XXX', 'NORTH AMERICA', mex + can, m]);
    const gtm = recent ? 95e6 : 100e6;        // Guatemala −5%: below the threshold
    rows['0803']!.push(['-', 'TOTAL FOR ALL COUNTRIES', gtm + 50e6, m], ['2050', 'GUATEMALA', gtm, m], ['3310', 'ECUADOR', 50e6, m]);
  }
  return { latest: '2026-07', rows };
}

describe('Census import declines', () => {
  it('flags an origin whose three-month shipments fell by a fifth or more versus a year earlier', () => {
    const { declines, unmapped } = importDeclines(raw());
    expect(unmapped).toEqual([]);
    expect(declines.map((d) => `${d.commodity}:${d.iso3}`)).toEqual(['tomatoes:MEX']);
    const d = declines[0]!;
    expect(d.decline).toBeCloseTo(0.5, 6);
    expect(d.share).toBeCloseTo(200 / 280, 6);
    expect(d.years).toBe(3);
    expect(d.replacements[0]?.country).toBe('Canada');
    expect(d.regionId).toBe('mexico');
    expect(d.window).toEqual(['2026-05', '2026-06', '2026-07']);
  });
  it('turns declines into anticipated import-decline items with a plain summary and world totals as series', () => {
    const r = trade.parse(raw());
    expect(r.items.length).toBe(1);
    const it = r.items[0]!;
    expect(it.category).toBe('import_decline');
    expect(it.status).toBe('breaking');
    expect(it.severity).toBeCloseTo(0.5, 6);
    expect(it.regionId).toBe('mexico');
    expect(it.summary).toContain('down 50%');
    expect(it.summary).toContain('May–Jul 2026');
    expect(r.series?.['imports.tomatoes']?.values.length).toBe(39);
    expect(it.summary).toContain('previous 3 years');
    expect(it.summary).toContain('Canada (+');
  });
});

describe('price stress join', () => {
  const months: string[] = [];
  const values: number[] = [];
  for (let y = 2010; y <= 2026; y++) for (let m = 1; m <= 12; m++) {
    if (y === 2026 && m > 7) break;
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    values.push(2 * (1 + 0.02 * (y - 2010)) * (1 + 0.05 * Math.sin((m / 12) * 2 * Math.PI)) * (1 + 0.01 * Math.cos(y * 3 + m)));
  }
  const spiked = values.slice(); spiked[spiked.length - 1] = spiked[spiked.length - 1]! * 1.5;
  const item: FeedItem = { id: 'trade-tomatoes-mex', name: 'x', category: 'import_decline', commodities: [{ id: 'tomatoes', relevance: 1 }], status: 'breaking', confidence: 0.85, summary: 'Imports fell.' };

  it('scores commodities and upgrades a decline to active when store prices are abnormally high', () => {
    const stress = priceStress({ tomatoes: { months, values: spiked } }, { tomatoes: 'APU0000712311' });
    expect(stress[0]!.anomaly?.level).toBe('abnormally-high');
    const [out] = applyPriceStress([item], stress);
    expect(out!.status).toBe('active');
    expect(out!.summary).toContain('abnormally high');
  });
  it('leaves a decline anticipated when store prices are normal', () => {
    const stress = priceStress({ tomatoes: { months, values } }, { tomatoes: 'APU0000712311' });
    const [out] = applyPriceStress([item], stress);
    expect(out!.status).toBe('breaking');
    expect(out!.summary).toContain('not reached shelves');
  });
  it('says so when no price series is tracked', () => {
    const [out] = applyPriceStress([item], []);
    expect(out!.status).toBe('breaking');
    expect(out!.summary).toContain('not measured');
  });
});
