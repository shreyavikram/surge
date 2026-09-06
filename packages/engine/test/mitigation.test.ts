import { loadContext } from '@surge/config';
import { describe, it, expect } from 'vitest';
import { planMitigation } from '../src/mitigation.js';
import { computeImpact } from '../src/impact.js';
import { threatToShocks } from '../src/shock.js';
import { loadContext, loadCase } from '@surge/config';
import type { LeverConfig } from '../src/types.js';

const ctx = loadContext();
const lever = (o: Partial<LeverConfig>): LeverConfig => ({
  id: 'l', name: 'L', commodity: 'x', type: 'import', capacityPerMonth: 10, leadMonths: 0, rampMonths: 1, unitCost: 1, fixedCost: 0,
  enabledByDefault: true, precedent: { name: 'p', url: 'u', note: '' }, source: 's', ...o,
});

describe('planMitigation mechanics', () => {
  it('allocates cheapest first and respects capacity, lead, and ramp', () => {
    const levers = [
      lever({ id: 'cheap', unitCost: 1, capacityPerMonth: 4, leadMonths: 1, rampMonths: 2 }),
      lever({ id: 'dear', unitCost: 5, capacityPerMonth: 10, leadMonths: 0, rampMonths: 1 }),
    ];
    const plan = planMitigation([10, 10, 10], levers, { commodity: 'x', unit: 'u' });
    const cheap = plan.levers.find((l) => l.id === 'cheap')!, dear = plan.levers.find((l) => l.id === 'dear')!;
    expect(cheap.unitsPath).toEqual([0, 2, 4]);
    expect(dear.unitsPath).toEqual([10, 8, 6]);
    expect(plan.coverage).toEqual([1, 1, 1]);
    expect(plan.totalCost).toBeCloseTo(6 * 1 + 24 * 5, 9);
    expect(plan.timeToCloseMonths).toBe(0);
  });
  it('caps stockpiles and regulatory unlocks', () => {
    const levers = [
      lever({ id: 'reg', type: 'regulatory', capacityPerMonth: 0, stock: 5 }),
      lever({ id: 'imp', requires: 'reg', capacityPerMonth: 10, leadMonths: 0 }),
      lever({ id: 'stk', type: 'stockpile', stock: 3, capacityPerMonth: 3, unitCost: 0.5 }),
    ];
    const plan = planMitigation([10, 10], levers, { commodity: 'x', unit: 'u' });
    const imp = plan.levers.find((l) => l.id === 'imp')!, stk = plan.levers.find((l) => l.id === 'stk')!, reg = plan.levers.find((l) => l.id === 'reg')!;
    expect(stk.cumulative).toBe(3);
    expect(imp.cumulative).toBe(5);
    expect(reg.enabledUnits).toBe(5);
    expect(plan.uncoveredShare).toBeCloseTo(1 - 8 / 20, 9);
  });
  it('effective lead of a dependent is at least its requirement lead', () => {
    const levers = [lever({ id: 'reg', type: 'regulatory', capacityPerMonth: 0, leadMonths: 2 }), lever({ id: 'imp', requires: 'reg', leadMonths: 0 })];
    const plan = planMitigation([5, 5, 5], levers, { commodity: 'x', unit: 'u' });
    expect(plan.levers.find((l) => l.id === 'imp')!.unitsPath).toEqual([0, 0, 5]);
  });
  it('demand-side levers ration, they do not supply', () => {
    const plan = planMitigation([10], [lever({ id: 'ration', type: 'demand_side', capacityPerMonth: 0, rationingShare: 0.1 })], { commodity: 'x', unit: 'u' });
    expect(plan.rationed).toEqual([1]);
    expect(plan.covered).toEqual([0]);
    expect(plan.coverage[0]).toBeCloseTo(0.1, 9);
  });
  it('activate and deactivate override defaults', () => {
    const levers = [lever({ id: 'off', enabledByDefault: false }), lever({ id: 'on', enabledByDefault: true })];
    const p1 = planMitigation([5], levers, { commodity: 'x', unit: 'u', activate: ['off'], deactivate: ['on'] });
    expect(p1.levers.find((l) => l.id === 'off')!.cumulative).toBe(5);
    expect(p1.levers.find((l) => l.id === 'on')!.classification).toBe('unused');
  });
  it('returns null time to close when the gap never closes', () => {
    const plan = planMitigation([10, 10], [lever({ capacityPerMonth: 1 })], { commodity: 'x', unit: 'u' });
    expect(plan.timeToCloseMonths).toBeNull();
  });
});

describe('published cases', () => {
  it('formula 2022: enforcement discretion does the work, the airlift is marginal', () => {
    const c = loadCase('formula-2022');
    const impact = computeImpact(threatToShocks(c.threats[0]!, ctx), ctx);
    const gap = impact.shortfall['infant-formula']!.units;
    const plan = planMitigation(gap, ctx.levers, { commodity: 'infant-formula', unit: '8-oz bottle-equivalent' });
    const fda = plan.levers.find((l) => l.id === 'formula-fda-enforcement-discretion')!;
    const air = plan.levers.find((l) => l.id === 'formula-fly-formula-airlift')!;
    const com = plan.levers.find((l) => l.id === 'formula-commercial-imports')!;
    expect(['does the work', 'contributes']).toContain(fda.classification);
    expect(air.classification).toBe('marginal');
    expect(fda.enabledUnits).toBeGreaterThan(air.cumulative * 3);
    expect(fda.share).toBeGreaterThan(air.share);
    expect(plan.levers.find((l) => l.id === 'formula-sturgis-restart')).toBeUndefined();
    expect(air.cost / Math.max(1, air.cumulative)).toBeGreaterThan(com.cost / Math.max(1, com.cumulative));
  });
  it('eggs 2022: every lever is marginal and most of the gap is borne by consumers', () => {
    const c = loadCase('egg-2022');
    const impact = computeImpact(threatToShocks(c.threats[0]!, ctx), ctx);
    const plan = planMitigation(impact.shortfall['eggs']!.units, ctx.levers, { commodity: 'eggs', unit: 'dozen' });
    for (const l of plan.levers) expect(l.classification).not.toBe('does the work');
    for (const l of plan.levers) expect(l.share).toBeLessThan(0.25);
    expect(plan.uncoveredShare).toBeGreaterThan(0.5);
    expect(plan.levers.find((l) => l.id === 'egg-broiler-redirect')!.classification).toBe('unused');
  });
});

import { runThreat, leversFor } from '../src/scenario.js';
describe('lever templates', () => {
  const ctx2 = loadContext();
  it('commodities without their own levers inherit resolved templates', () => {
    const ls = leversFor('tomatoes', ctx2);
    expect(ls.length).toBeGreaterThanOrEqual(4);
    const imp = ls.find((l) => l.type === 'import')!;
    const c = ctx2.commodities['tomatoes']!;
    expect(imp.capacityPerMonth).toBeCloseTo(0.08 * c.baseline.annualQuantity / 12, 6);
    expect(imp.requires).toBe('tpl-import-facilitation:tomatoes');
    expect(ls.find((l) => l.type === 'domestic_ramp')!.leadMonths).toBe(9); // crop: next harvest
  });
  it('eggs keep their own calibrated levers', () => {
    expect(leversFor('eggs', ctx2).every((l) => l.commodity === 'eggs' && !l.id.includes(':'))).toBe(true);
  });
  it('a tariff on Mexican tomatoes gets an offset plan with a regulatory unlock doing the work', () => {
    const r = runThreat({ id: 't', name: 't', category: 'tariff', kind: 'geopolitical', location: { lat: 23, lng: -102, regionId: 'mexico' }, commodities: [{ id: 'tomatoes', relevance: 1 }], severity: 0.25, start: '2026-09', months: 12, source: { feed: 't', kind: 'user' } }, ctx2);
    const plan = r.mitigation['tomatoes']!;
    expect(plan.offset).toBe(true);
    expect(plan.cumulativeGap).toBeGreaterThan(0);
    expect(plan.levers.some((l) => l.classification !== 'unused')).toBe(true);
    expect(plan.uncoveredShare).toBeLessThan(1);
  });
});
