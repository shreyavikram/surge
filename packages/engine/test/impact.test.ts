import { describe, it, expect } from 'vitest';
import { computeImpact } from '../src/impact.js';
import { threatToShocks } from '../src/shock.js';
import { loadContext, loadCase } from '@surge/config';

const ctx = loadContext();

describe('computeImpact', () => {
  it('egg 2024 calibration on the observed path reproduces the published loss within 2%', () => {
    const c = loadCase('egg-2024-calibration');
    const over = { ...ctx, overrides: { elasticity: { eggs: -0.228 }, pricePath: 'observed' as const } };
    const shocks = threatToShocks(c.threats[0]!, over);
    const r = computeImpact(shocks, over, { observed: c.observed! });
    expect(r.price.path).toBe('observed');
    expect(Math.abs(r.welfare.csReplica - 1414.28e6) / 1414.28e6).toBeLessThan(0.02);
    expect(Math.abs(r.welfare.cv - 1414.28e6) / 1414.28e6).toBeLessThan(0.02);
    expect(r.welfare.band.low).toBeLessThanOrEqual(r.welfare.cv);
    expect(r.welfare.band.high).toBeGreaterThanOrEqual(r.welfare.cv);
  });
  it('single-good CS replica and multi-good CV agree within 0.5% when only eggs move', () => {
    const c = loadCase('egg-2022');
    const r = computeImpact(threatToShocks(c.threats[0]!, ctx), ctx);
    expect(Math.abs(r.welfare.cv - r.welfare.csReplica) / r.welfare.csReplica).toBeLessThan(0.005);
    expect(r.commodities).toEqual(['eggs']);
    expect(r.months.length).toBe(24);
    expect(r.durationMonths).toBeGreaterThan(9);
  });
  it('2022 modeled loss lands between the Mitchell and Ferrier published ranges', () => {
    const c = loadCase('egg-2022');
    const r = computeImpact(threatToShocks(c.threats[0]!, ctx), ctx);
    expect(r.welfare.cv).toBeGreaterThan(0.5e9);
    expect(r.welfare.cv).toBeLessThan(5e9);
  });
  it('labels every assumption measured or modeled with a source', () => {
    const c = loadCase('egg-2022');
    const r = computeImpact(threatToShocks(c.threats[0]!, ctx), ctx);
    expect(r.assumptions.length).toBeGreaterThan(5);
    for (const a of r.assumptions) { expect(['measured', 'modeled']).toContain(a.kind); expect(a.source.length).toBeGreaterThan(3); }
    expect(r.checks.slutskySymmetryAdjustment).toBeGreaterThanOrEqual(0);
  });
  it('substitution readout lists other items with significance flags', () => {
    const c = loadCase('egg-2022');
    const r = computeImpact(threatToShocks(c.threats[0]!, ctx), ctx);
    const poultry = r.welfare.substitution.find((s) => s.commodity === 'poultry');
    expect(poultry).toBeDefined();
    expect(typeof poultry!.significant).toBe('boolean');
    expect(r.welfare.substitution.some((s) => s.commodity === 'eggs')).toBe(false);
    expect(r.welfare.substitution.some((s) => s.commodity === 'nonfood')).toBe(false);
    expect(r.welfare.cvByMonth.length).toBe(r.months.length);
    expect(r.welfare.cvAnnual).toBeCloseTo(r.welfare.cvByMonth.slice(0, 12).reduce((a, b) => a + b, 0), 6);
  });
  it('is order independent for two shocks', () => {
    const egg = threatToShocks(loadCase('egg-2022').threats[0]!, ctx);
    const formula = threatToShocks(loadCase('formula-2022').threats[0]!, ctx);
    const a = computeImpact([...egg, ...formula], ctx).welfare.cv;
    const b = computeImpact([...formula, ...egg], ctx).welfare.cv;
    expect(a).toBeCloseTo(b, 6);
  });
  it('splits item-level welfare across commodities that share a demand item', () => {
    const chicken = threatToShocks({ id: 'c', name: 'C', category: 'disease', kind: 'natural', location: { lat: 33, lng: -86, regionId: 'us-southeast-broilers' }, commodities: [{ id: 'chicken', relevance: 1 }], severity: 0.5, start: '2024-01', months: 6, source: { feed: 't', kind: 'user' } }, ctx);
    const turkey = threatToShocks({ id: 't', name: 'T', category: 'disease', kind: 'natural', location: { lat: 39.8, lng: -98.6, regionId: 'us-national' }, commodities: [{ id: 'turkey', relevance: 1 }], severity: 0.1, start: '2024-01', months: 6, source: { feed: 't', kind: 'user' } }, ctx);
    const r = computeImpact([...chicken, ...turkey], ctx);
    expect(r.commodities).toEqual(['chicken', 'turkey']);
    expect(r.welfare.byCommodity['chicken']).toBeGreaterThan(0);
    expect(r.welfare.byCommodity['turkey']).toBeGreaterThan(0);
    expect(Math.abs(r.welfare.byCommodity['chicken']! + r.welfare.byCommodity['turkey']! - r.welfare.cv) / r.welfare.cv).toBeLessThan(0.02);
  });
});
