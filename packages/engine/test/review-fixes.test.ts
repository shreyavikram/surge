import { describe, it, expect } from 'vitest';
import { computeImpact } from '../src/impact.js';
import { threatToShocks, SHOCK_CONSTANTS } from '../src/shock.js';
import { planMitigation } from '../src/mitigation.js';
import { quarterlyMeans } from '../src/biology.js';
import { loadContext, loadCase } from '@surge/config';
import type { Threat } from '../src/types.js';

// Regression tests for the findings of the 2026-09-06 red-team review (docs/DATA-AUDIT.md, DECISIONS.md #23).
const ctx = loadContext();
const threat = (over: Partial<Threat>): Threat => ({
  id: 't', name: 'T', category: 'disease', kind: 'natural',
  location: { lat: 42, lng: -93.5, regionId: 'us-iowa' },
  commodities: [{ id: 'eggs', relevance: 1 }], severity: 0.5, start: '2026-01',
  source: { feed: 'test', kind: 'user' }, ...over,
});

describe('retail lag no longer truncates short shocks', () => {
  it('a one-month Suez delay on coffee (lag 3) still reaches retail and costs consumers something', () => {
    const t = threat({ category: 'chokepoint', kind: 'geopolitical', location: { lat: 30, lng: 32.5, regionId: 'suez-red-sea' }, commodities: [{ id: 'coffee', relevance: 1 }], severity: 0.5, months: 3 });
    const r = computeImpact(threatToShocks(t, ctx), ctx);
    expect(r.months.length).toBe(3 + ctx.commodities['coffee']!.transmission.lagMonths);
    expect(Math.max(...r.price.retailPct['coffee']!)).toBeGreaterThan(0);
    expect(r.welfare.cv).toBeGreaterThan(0);
  });
});

describe('crop losses run one marketing year regardless of the duration dial', () => {
  it('cumulative potato loss is the same at 12 and 24 months', () => {
    const mk = (months: number) => threatToShocks(threat({ category: 'drought', location: { lat: 46, lng: -119, regionId: 'us-pacific-northwest' }, commodities: [{ id: 'potatoes', relevance: 1 }], severity: 0.28, months }), ctx);
    const sum = (m: number) => mk(m)[0]!.supplyPath.reduce((a, b) => a + b, 0);
    expect(sum(24)).toBeCloseTo(sum(12), 9);
    expect(sum(6)).toBeLessThan(sum(12));
  });
});

describe('weather cannot destroy manufactured or imported goods at home', () => {
  it('a Michigan drought does not cut infant formula, cheese or bread supply', () => {
    const ids = ['infant-formula', 'cheese', 'bread', 'bananas', 'coffee'];
    const t = threat({ category: 'drought', location: { lat: 44, lng: -85, regionId: 'us-state-MI' }, commodities: ids.map((id) => ({ id, relevance: 1 })), severity: 0.35 });
    const shocks = threatToShocks(t, ctx);
    expect(shocks.filter((s) => s.supplyPath.some((v) => v > 0)).map((s) => s.commodity)).toEqual([]);
  });
  it('a hurricane in Guatemala still cuts banana imports', () => {
    const t = threat({ category: 'storm', location: { lat: 15, lng: -90, regionId: 'guatemala' }, commodities: [{ id: 'bananas', relevance: 1 }], severity: 0.5 });
    const [s] = threatToShocks(t, ctx);
    expect(s?.origin).toBe('import');
    expect(s!.supplyPath[0]).toBeGreaterThan(0);
  });
});

describe('livestock disease abroad reaches the US through imports', () => {
  it('an HPAI wave in a supplier region produces an import-origin egg shock', () => {
    const supplier = Object.values(ctx.regions).find((r) => r.usImportOriginShare?.['eggs'] !== undefined && r.usSupplyShare?.['eggs'] === undefined);
    expect(supplier).toBeDefined();
    const [s] = threatToShocks(threat({ location: { lat: supplier!.lat, lng: supplier!.lng, regionId: supplier!.id }, severity: 0.5 }), ctx);
    expect(s?.origin).toBe('import');
    expect(s!.supplyPath[0]).toBeGreaterThan(0);
  });
});

describe('world price rule', () => {
  it('Ukraine and Russia together at half severity lift the world wheat price by roughly the 2022 magnitude', () => {
    const mk = (regionId: string) => threatToShocks(threat({ category: 'war', kind: 'geopolitical', location: { lat: 49, lng: 32, regionId }, commodities: [{ id: 'wheat', relevance: 1 }], severity: 0.5 }), ctx);
    const rise = (regionId: string) => Math.max(...mk(regionId).map((s) => s.costPath?.[0] ?? 0));
    // both shocks are cost paths on bread (wheat cost share 0.06): back out the wheat price rise
    const share = ctx.commodities['bread']!.inputs!.find((i) => i.input === 'wheat')!.costShare;
    const worldRise = (rise('ukraine') + rise('russia')) / share;
    const expected = ((0.09 + 0.2) * 0.5) / SHOCK_CONSTANTS.WORLD_EXCESS_DEMAND_ELASTICITY;
    expect(worldRise).toBeCloseTo(expected, 6);
    expect(worldRise).toBeGreaterThan(0.3);
    expect(worldRise).toBeLessThan(0.6);
  });
});

describe('relief levers honour their requirements', () => {
  it('deactivating the import-facilitation rule removes the imports that depend on it', () => {
    const gap = new Array<number>(12).fill(50e6);
    const withRule = planMitigation(gap, ctx.levers, { commodity: 'eggs', unit: 'dozen' });
    const without = planMitigation(gap, ctx.levers, { commodity: 'eggs', unit: 'dozen', deactivate: ['egg-usda-import-facilitation'] });
    const delivered = (p: typeof withRule, id: string) => p.levers.find((l) => l.id === id)?.cumulative ?? 0;
    expect(delivered(withRule, 'egg-imports')).toBeGreaterThan(0);
    expect(delivered(without, 'egg-imports')).toBe(0);
  });
});

describe('producer revenue is valued at the farm share of the retail price', () => {
  it('bread producers gain far less than a retail-price valuation would imply', () => {
    const t = threat({ category: 'war', kind: 'geopolitical', location: { lat: 49, lng: 32, regionId: 'ukraine' }, commodities: [{ id: 'wheat', relevance: 1 }], severity: 0.5, months: 6 });
    const r = computeImpact(threatToShocks(t, ctx), ctx);
    const c = ctx.commodities['bread']!;
    const retailValued = r.price.wholesalePct['bread']!.reduce((a, pw) => a + (c.baseline.annualQuantity / 12) * c.baseline.retailPrice * pw, 0);
    expect(r.welfare.producerRevenueChange['bread']!).toBeCloseTo(retailValued * c.baseline.farmShare!, 3);
    expect(r.assumptions.some((a) => a.key === 'farmShare.bread')).toBe(true);
  });
});

describe('2022 egg case reproduces the published quarterly shortfalls', () => {
  it('Q2–Q4 2022 within 2.5 points of Ferrier, Saavoss and Williamson (2024)', () => {
    const c = loadCase('egg-2022');
    const [s] = threatToShocks(c.threats[0]!, ctx);
    const first = s!.start; // YYYY-MM
    const startMonth = Number(first.slice(5, 7));
    const offsetToApril = (4 - startMonth + 12) % 12;
    const q = quarterlyMeans(s!.supplyPath, offsetToApril);
    const exp = c.expected as Record<string, number>;
    expect(Math.abs(q[0]! - exp['quarterlyShortfallQ2']!)).toBeLessThan(0.025);
    expect(Math.abs(q[1]! - exp['quarterlyShortfallQ3']!)).toBeLessThan(0.025);
    expect(Math.abs(q[2]! - exp['quarterlyShortfallQ4']!)).toBeLessThan(0.025);
  });
});
