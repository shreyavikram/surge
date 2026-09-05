import { describe, it, expect } from 'vitest';
import { loadContext, loadCase } from '../src/index.js';
import { validateConfig, buildDemandSystem, toHicksian, symmetrize, slutskyMatrix, checkNSD } from '@surge/engine';

describe('config', () => {
  const ctx = loadContext();
  it('passes schema validation', () => {
    expect(validateConfig(ctx)).toEqual([]);
  });
  it('has the ERR-139 diagonal', () => {
    const ds = buildDemandSystem(ctx.demand);
    const own = (id: string) => ds.eps[ds.index[id]!]![ds.index[id]!]!;
    expect(own('eggs')).toBeCloseTo(-0.24, 2);
    expect(own('beef')).toBeCloseTo(-0.70, 2);
    expect(own('pork')).toBeCloseTo(-1.26, 2);
    expect(own('poultry')).toBeCloseTo(-0.81, 2);
    expect(own('milk')).toBeCloseTo(-0.10, 2);
    expect(own('nonfood')).toBeCloseTo(-1.00, 2);
    expect(ds.ids.length).toBe(44);
  });
  it('has budget shares that sum to about 1 (excluding infant formula)', () => {
    const total = ctx.demand.items.filter((i) => i.id !== 'infant_formula').reduce((a, i) => a + i.budgetShare, 0);
    expect(total).toBeGreaterThan(0.97);
    expect(total).toBeLessThan(1.03);
    const eggs = ctx.demand.items.find((i) => i.id === 'eggs')!;
    expect(eggs.budgetShare).toBeCloseTo(0.0288 * 0.048, 4);
  });
  it('reports Slutsky symmetry adjustment and NSD status without throwing', () => {
    const ds = buildDemandSystem(ctx.demand);
    const skip = new Set([ds.index['nonfood']!]);
    const { epsC, maxAdjustment } = symmetrize(toHicksian(ds), ds.w, ds.se, skip);
    expect(maxAdjustment).toBeLessThan(0.5);
    const S = slutskyMatrix(epsC, ds.w);
    for (let i = 0; i < ds.ids.length; i++) for (let j = 0; j < ds.ids.length; j++) if (!skip.has(i) && !skip.has(j)) expect(S[i]![j]).toBeCloseTo(S[j]![i]!, 12);
    const r = checkNSD(slutskyMatrix(epsC, ds.w));
    expect(typeof r.ok).toBe('boolean');
  });
  it('maps every commodity to a demand item and every input to at least one commodity', () => {
    for (const c of Object.values(ctx.commodities)) expect(ctx.demand.items.some((i) => i.id === c.group)).toBe(true);
    for (const inp of Object.keys(ctx.inputs)) {
      expect(Object.values(ctx.commodities).some((c) => (c.inputs ?? []).some((x) => x.input === inp))).toBe(true);
    }
  });
  it('loads the three cases with expected figures', () => {
    expect(loadCase('egg-2024-calibration').expected!['consumerSurplusLossUSD']).toBeCloseTo(1414.28e6, -5);
    expect(loadCase('egg-2022').threats.length).toBeGreaterThan(0);
    expect(loadCase('formula-2022').threats[0]!.category).toBe('facility');
  });
});
