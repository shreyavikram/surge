import { describe, it, expect } from 'vitest';
import { cvSecondOrder, evApprox, csConstantElasticity, substitutionPct, incidenceByQuintile } from '../src/welfare.js';

describe('cvSecondOrder', () => {
  it('reduces to the trapezoid for one good', () => {
    const r = cvSecondOrder([1000], [[-0.5]], [0.2]);
    expect(r.cv).toBeCloseTo(190, 9);
    expect(r.firstOrder).toBeCloseTo(200, 9);
    expect(r.secondOrder).toBeCloseTo(-10, 9);
  });
  it('is invariant to item ordering', () => {
    const a = cvSecondOrder([100, 300], [[-0.5, 0.2], [0.0667, -0.8]], [0.1, 0.05]).cv;
    const b = cvSecondOrder([300, 100], [[-0.8, 0.0667], [0.2, -0.5]], [0.05, 0.1]).cv;
    expect(a).toBeCloseTo(b, 9);
  });
  it('includes cross terms when two prices move', () => {
    const r = cvSecondOrder([100, 300], [[-0.5, 0.2], [0.0667, -0.8]], [0.1, 0.05]);
    const first = 100 * 0.1 + 300 * 0.05;
    const second = 0.5 * (100 * -0.5 * 0.01 + 100 * 0.2 * 0.1 * 0.05 + 300 * 0.0667 * 0.05 * 0.1 + 300 * -0.8 * 0.0025);
    expect(r.cv).toBeCloseTo(first + second, 9);
  });
});

describe('csConstantElasticity', () => {
  it('matches the analytic integral', () => {
    expect(csConstantElasticity(1000, 0.09, -0.228)).toBeCloseTo(1000 * (Math.pow(1.09, 0.772) - 1) / 0.772, 9);
  });
  it('handles unit elasticity with a log', () => {
    expect(csConstantElasticity(1000, 0.5, -1)).toBeCloseTo(1000 * Math.log(1.5), 9);
  });
  it('is within 1% of the trapezoid for egg-sized shocks', () => {
    const exact = csConstantElasticity(1000, 0.09, -0.228);
    const trap = cvSecondOrder([1000], [[-0.228]], [0.09]).cv;
    expect(Math.abs(exact - trap) / exact).toBeLessThan(0.01);
  });
});

describe('evApprox', () => {
  it('is below CV for normal goods and a price rise', () => {
    const cv = cvSecondOrder([1000], [[-0.5]], [0.2]).cv;
    const ev = evApprox(cv, [1000], [0.5], [0.2], 100000);
    expect(ev).toBeLessThan(cv);
    expect(cv - ev).toBeCloseTo(0.2, 9);
  });
});

describe('substitutionPct', () => {
  it('sums Marshallian cross effects and flags significance', () => {
    const r = substitutionPct([[-0.24, 0.05], [0.01, -0.81]], [0.1, 0], [[0.06, 0.04], [0.02, 0.28]]);
    expect(r.pct[0]).toBeCloseTo(-0.024, 12);
    expect(r.pct[1]).toBeCloseTo(0.001, 12);
    expect(r.significant[0]).toBe(true);
    expect(r.significant[1]).toBe(false);
  });
});

describe('incidenceByQuintile', () => {
  it('scales loss by quintile spending with the second-order term', () => {
    const r = incidenceByQuintile([60, 80, 100, 120, 160], 0.09, -0.228);
    expect(r).toHaveLength(5);
    expect(r[0]!.quintile).toBe(1);
    expect(r[0]!.lossPerHousehold).toBeCloseTo(60 * 0.09 * (1 + 0.5 * -0.228 * 0.09), 9);
  });
});
