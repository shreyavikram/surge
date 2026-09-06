import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadContext } from '@surge/config';
import { usdm } from '../src/feeds/usdm.js';
import { eia } from '../src/feeds/eia.js';
import { firms } from '../src/feeds/firms.js';
import { aphis, parseTableauMonthly } from '../src/feeds/aphis.js';
import { gta } from '../src/feeds/gta.js';
import { gdelt } from '../src/feeds/gdelt.js';
import { feedItemsToThreats, severityFor } from '../src/threats.js';

const fx = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
const ctx = loadContext();

describe('usdm adapter', () => {
  const r = usdm.parse(JSON.parse(fx('usdm.json')));
  it('emits a drought item only for states with 10%+ area in D2 or worse, scaled by region size', () => {
    const ks = r.items.find((i) => i.id === 'usdm-KS')!;
    expect(ks).toBeDefined();
    expect(ks.category).toBe('drought');
    expect(ks.alertScore).toBe(true);
    expect(ks.regionId).toBe('us-plains-wheat');
    expect(ks.severity!).toBeGreaterThan(0);
    expect(ks.severity!).toBeLessThan(1);
  });
  it('turns into an engine threat with the drought damage cap applied', () => {
    const threats = feedItemsToThreats(r.items, r.source, ctx);
    const ks = threats.find((t) => t.id === 'usdm-KS')!;
    expect(ks.severity).toBeCloseTo(severityFor(r.items.find((i) => i.id === 'usdm-KS')!, ctx), 9);
    expect(ks.severity).toBeLessThan(0.35);
    expect(ks.location.iso3).toBe('USA');
    expect(ks.commodities.map((c) => c.id)).toContain('wheat');
  });
});

describe('eia adapter', () => {
  const r = eia.parse(JSON.parse(fx('eia.json')));
  it('returns diesel and gas series and only flags a rise above 10%', () => {
    expect(Object.keys(r.series ?? {})).toEqual(['EMD_EPD2D_PTE_NUS_DPG', 'RNGWHHD']);
    for (const it of r.items) {
      expect(it.category).toBe('input_cost');
      expect(it.physical?.kind).toBe('input_price_increase');
      expect(it.physical!.value).toBeGreaterThanOrEqual(0.1);
      expect(it.severity!).toBeLessThanOrEqual(1);
    }
  });
});

describe('firms adapter', () => {
  it('counts hotspots per production region and emits wildfire items above the floor', () => {
    const r = firms.parse(fx('firms.csv'));
    for (const it of r.items) { expect(it.category).toBe('wildfire'); expect(it.alertScore).toBe(true); expect(ctx.regions[it.regionId!]).toBeDefined(); }
  });
});

describe('aphis adapter', () => {
  it('parses the monthly dashboard sheet', () => {
    const m = parseTableauMonthly(fx('aphis-monthly.csv'));
    expect(m.length).toBeGreaterThan(0);
    expect(m[0]!.month).toMatch(/^\d{4}-\d{2}$/);
  });
  it('produces a national disease threat only when birds affected are known', () => {
    const none = aphis.parse({ monthly: parseTableauMonthly(fx('aphis-monthly.csv')) });
    expect(none.items).toEqual([]);
    const some = aphis.parse({ monthly: [{ month: '2026-03', birds: 8e6 }, { month: '2026-04', birds: 4e6 }] });
    expect(some.items).toHaveLength(1);
    expect(some.items[0]!.severity).toBeCloseTo(12e6 / 325e6, 6);
    expect(some.items[0]!.physical?.timeline).toHaveLength(2);
    const t = feedItemsToThreats(some.items, some.source, ctx)[0]!;
    expect(t.location.regionId).toBe('us-national');
  });
});

describe('gta adapter', () => {
  it('keeps tariff/export-ban interventions on modeled products with a known supplier region', () => {
    const r = gta.parse(JSON.parse(fx('gta.json')));
    for (const it of r.items) {
      expect(['tariff', 'export_ban', 'embargo']).toContain(it.category);
      expect(ctx.regions[it.regionId!]).toBeDefined();
      expect(it.commodities!.length).toBeGreaterThan(0);
    }
  });
  it('maps a synthetic US tariff on Mexican tomatoes', () => {
    const r = gta.parse([{ intervention_id: 1, state_act_title: 'United States: 25% tariff on tomato imports from Mexico', intervention_type: 'Import tariff', date_announced: new Date().toISOString().slice(0, 10), date_implemented: new Date().toISOString().slice(0, 10), implementing_jurisdictions: [{ iso: 'USA', name: 'United States' }], affected_jurisdictions: [{ iso: 'MEX', name: 'Mexico' }], affected_products: [70200] }]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.category).toBe('tariff');
    expect(r.items[0]!.severity).toBeCloseTo(0.25, 9);
    expect(r.items[0]!.regionId).toBe('mexico');
    expect(r.items[0]!.status).toBe('active');
  });
});

describe('gdelt adapter', () => {
  it('turns headlines into breaking items through the interpreter, dropping irrelevant ones', () => {
    const r = gdelt.parse(JSON.parse(fx('gdelt.json')));
    const ids = r.items.map((i) => i.id);
    expect(r.items.every((i) => i.status === 'breaking' && (i.confidence ?? 0) > 0)).toBe(true);
    expect(ids.some((i) => i.includes('export-ban-india-rice'))).toBe(true);
    expect(ids.some((i) => i.includes('disease-us-iowa'))).toBe(true);
    expect(r.items.some((i) => /Paris/.test(i.name))).toBe(false);
    const threats = feedItemsToThreats(r.items, r.source, ctx);
    expect(threats.every((t) => t.status === 'breaking')).toBe(true);
    expect(threats.find((t) => t.location.regionId === 'india-rice')!.location.iso3).toBeUndefined();
  });
});
