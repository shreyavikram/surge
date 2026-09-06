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
    expect(ks.regionId).toBe('us-state-KS');
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
  it('spares irrigated cropland: the same D2 area scores lower in California than in Kansas', () => {
    const row = (st: string) => ({ MapDate: '20260901', StateAbbreviation: st, D0: 80, D1: 60, D2: 40, D3: 15, D4: 2, ValidStart: '2026-09-01' });
    const out = usdm.parse({ rows: [row('CA'), row('KS')] });
    const ca = out.items.find((i) => i.id === 'usdm-CA')!, ks = out.items.find((i) => i.id === 'usdm-KS')!;
    const base = (0.4 * 25 + 0.7 * 13 + 1.0 * 2) / 100;
    expect(ks.severity).toBeCloseTo(base * (1 - 0.8 * 0.12), 9);
    expect(ca.severity).toBeCloseTo(base * (1 - 0.8 * 0.75), 9);
    expect(ca.severity!).toBeLessThan(ks.severity!);
    expect(ca.text).toMatch(/75% of cropland irrigated/);
    expect(ks.text).toMatch(/12% of cropland irrigated/);
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
  it('counts hotspots per state and emits wildfire items above the floor', () => {
    const r = firms.parse(fx('firms.csv'));
    for (const it of r.items) { expect(it.category).toBe('wildfire'); expect(it.alertScore).toBe(true); expect(ctx.regions[it.regionId!]).toBeDefined(); expect(it.regionId).toMatch(/^us-state-/); }
  });
  it('weights hotspots by fire radiative power inside the state outline, not its bounding box', () => {
    const head = 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight';
    const row = (lat: number, lng: number, frp: number) => `${lat},${lng},330,0.5,0.5,2026-09-05,1200,N,VIIRS,n,2.0NRT,300,${frp},D`;
    const ks = Array.from({ length: 20 }, (_, i) => row(38.5 + i * 0.01, -98.5, 100));      // 2,000 MW in Kansas
    const gulf = Array.from({ length: 50 }, (_, i) => row(28 + i * 0.01, -85, 500));         // 25,000 MW in the Gulf, inside Florida's bbox
    const ne = Array.from({ length: 5 }, (_, i) => row(41.5 + i * 0.01, -99.5, 100));        // 500 MW in Nebraska: below the floor
    const r = firms.parse([head, ...ks, ...gulf, ...ne].join('\n'));
    expect(r.items.map((i) => i.regionId)).toEqual(['us-state-KS']);
    const k = r.items[0]!;
    expect(k.severity).toBeCloseTo(2000 / 20000, 9);
    expect(k.name).toMatch(/20 hotspots, 2,000 MW/);
    expect(k.start).toBe('2026-09');
    expect(k.text).toMatch(/fire radiative power 2,000 MW/);
  });
});

describe('aphis adapter', () => {
  it('parses the monthly dashboard sheet', () => {
    const m = parseTableauMonthly(fx('aphis-monthly.csv'));
    expect(m.length).toBeGreaterThan(0);
    expect(m[0]!.month).toMatch(/^\d{4}-\d{2}$/);
  });
  it('produces no threat without the per-detection archive, and a national one with it', () => {
    const none = aphis.parse({ monthly: parseTableauMonthly(fx('aphis-monthly.csv')), detections: [] });
    expect(none.items).toEqual([]);
    expect(none.source.kind).toBe('live');
    const now = new Date();
    const ym = (k: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)).toISOString().slice(0, 10);
    const some = aphis.parse({ monthly: [], detections: [{ date: ym(2), state: 'Iowa', county: 'Sioux', production: 'Commercial Table Egg Layer', birds: 8e6 }, { date: ym(1), state: 'Ohio', county: 'Darke', production: 'Commercial Table Egg Layer', birds: 4e6 }] });
    expect(some.items).toHaveLength(1);
    expect(some.items[0]!.severity).toBeCloseTo(12e6 / 325e6, 6);
    expect(some.items[0]!.physical?.timeline).toHaveLength(2);
    expect(some.source.kind).toBe('archive');
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
    expect(ids.some((i) => i.includes('export-ban-india'))).toBe(true);
    expect(ids.some((i) => i.includes('disease-us-state-ia'))).toBe(true);
    expect(r.items.some((i) => /Paris/.test(i.name))).toBe(false);
    const threats = feedItemsToThreats(r.items, r.source, ctx);
    expect(threats.every((t) => t.status === 'breaking')).toBe(true);
    expect(threats.find((t) => t.location.regionId === 'india')!.location.iso3).toBe('IND');
  });
});
