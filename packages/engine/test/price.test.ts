import { describe, it, expect } from 'vitest';
import { retailPriceChange, pricePaths, observedRetailPath } from '../src/price.js';

describe('retailPriceChange', () => {
  it('is shortfall over |elasticity| with no trade and full pass-through', () => {
    expect(retailPriceChange(0.05, { eps: -0.25, exportShare: 0, exportElasticity: -2, passThrough: 1, lagMonths: 0 })).toBeCloseTo(0.2, 12);
  });
  /** Ferrier et al. (2024): 5.7% Q2-2022 egg shortfall with ε = −0.27 → their EDM gives 22.5–25.6%. */
  it('matches the Ferrier magnitude for the 2022 Q2 egg shortfall', () => {
    const pi = retailPriceChange(0.057, { eps: -0.27, exportShare: 0, exportElasticity: -2, passThrough: 1, lagMonths: 0 });
    expect(pi).toBeGreaterThan(0.19);
    expect(pi).toBeLessThan(0.26);
  });
  it('is smaller when exports absorb part of the shock', () => {
    const noTrade = retailPriceChange(0.057, { eps: -0.27, exportShare: 0, exportElasticity: -2, passThrough: 0.7, lagMonths: 0 });
    const trade = retailPriceChange(0.057, { eps: -0.27, exportShare: 0.025, exportElasticity: -2, passThrough: 0.7, lagMonths: 0 });
    expect(trade).toBeLessThan(noTrade);
    expect(trade).toBeCloseTo(0.057 / (0.975 * 0.27 + 0.025 * 2 / 0.7), 12);
  });
  it('throws when the clearing denominator is zero', () => {
    expect(() => retailPriceChange(0.1, { eps: 0, exportShare: 0, exportElasticity: 0, passThrough: 1, lagMonths: 0 })).toThrow();
  });
});

describe('pricePaths', () => {
  const p = { eps: -0.25, exportShare: 0, exportElasticity: -2, passThrough: 0.5, lagMonths: 1 };
  it('lags retail behind wholesale and applies pass-through', () => {
    const r = pricePaths([0.05, 0.05, 0], undefined, p);
    expect(r.wholesalePct[0]).toBeCloseTo(0.4, 12);
    expect(r.retailPct[0]).toBe(0);
    expect(r.retailPct[1]).toBeCloseTo(0.2, 12);
    expect(r.retailPct[2]).toBeCloseTo(0.2, 12);
    expect(r.quantityPct[1]).toBeCloseTo(-0.05, 12);
  });
  it('adds cost wedges to wholesale', () => {
    const r = pricePaths([0, 0], [0.1, 0.1], { ...p, lagMonths: 0 });
    expect(r.wholesalePct[0]).toBeCloseTo(0.1, 12);
    expect(r.retailPct[0]).toBeCloseTo(0.05, 12);
  });
});

describe('observedRetailPath', () => {
  it('attributes a share of the observed deviation from counterfactual', () => {
    const r = observedRetailPath([2.0, 3.0], [2.0, 2.0], 0.5);
    expect(r[0]).toBe(0);
    expect(r[1]).toBeCloseTo(0.25, 12);
  });
});
