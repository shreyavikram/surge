import { describe, it, expect } from 'vitest';
import { livestockShortfall, recoveredFraction, cropShortfall, manufacturingShortfall, quarterlyMeans } from '../src/biology.js';

describe('recoveredFraction', () => {
  it('is a uniform ramp between lagMin and lagMax', () => {
    expect(recoveredFraction(4, 5, 12)).toBe(0);
    expect(recoveredFraction(5, 5, 12)).toBeCloseTo(1 / 8, 12);
    expect(recoveredFraction(12, 5, 12)).toBeCloseTo(1, 12);
    expect(recoveredFraction(13, 5, 12)).toBe(1);
  });
  it('is a step when lagMin equals lagMax', () => {
    expect(recoveredFraction(5, 6, 6)).toBe(0);
    expect(recoveredFraction(6, 6, 6)).toBe(1);
  });
});

describe('livestockShortfall', () => {
  it('removes a cohort for the lag and returns it afterwards', () => {
    const path = livestockShortfall([{ month: 0, headLost: 10 }], { inventory: 100, lagMin: 6, lagMax: 6, producerOffset: 0, months: 8 });
    expect(path.slice(0, 6)).toEqual([0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
    expect(path[6]).toBe(0);
  });
  it('applies the producer offset', () => {
    const path = livestockShortfall([{ month: 0, headLost: 10 }], { inventory: 100, lagMin: 6, lagMax: 6, producerOffset: 0.35, months: 2 });
    expect(path[0]).toBeCloseTo(0.065, 12);
  });
  /**
   * 2022 HPAI egg case. Monthly table-egg layer depopulations (millions), Feb–Dec 2022,
   * from WATTPoultry's monthly summary (March 16.9M; waves 30.7M Feb–Jun and 12.6M Sep–Dec)
   * and the ERS April 2022 outlook (10.7M in April). Feb/May/Jun/Sep–Dec splits are
   * approximations of the wave totals; Plan 2 replaces them with the APHIS archive sums.
   * Validation target: Ferrier, Saavoss, Williamson (2024) Table 4 shortfall vs WASDE forecast:
   * Q2 5.7%, Q3 4.7%, Q4 6.5% (mean 5.6%).
   */
  it('reproduces the 2022 quarterly egg shortfall profile', () => {
    const events = [
      { month: 1, headLost: 2.5e6 }, { month: 2, headLost: 16.9e6 }, { month: 3, headLost: 10.7e6 },
      { month: 4, headLost: 0.3e6 }, { month: 5, headLost: 0.3e6 },
      { month: 8, headLost: 1.0e6 }, { month: 9, headLost: 3.2e6 }, { month: 10, headLost: 3.4e6 }, { month: 11, headLost: 5.0e6 },
    ];
    const path = livestockShortfall(events, { inventory: 325e6, lagMin: 5, lagMax: 12, producerOffset: 0.35, months: 24 });
    const q = quarterlyMeans(path, 0);
    const target = [0.057, 0.047, 0.065];
    const got = [q[1]!, q[2]!, q[3]!];
    got.forEach((g, i) => expect(Math.abs(g - target[i]!)).toBeLessThan(0.025));
    const mean = got.reduce((a, b) => a + b, 0) / 3;
    expect(Math.abs(mean - 0.056)).toBeLessThan(0.01);
    expect(path[23]).toBe(0);
  });
});

describe('cropShortfall', () => {
  it('spreads a harvest loss over the marketing year net of a stocks buffer', () => {
    const path = cropShortfall({ yieldLossFraction: 0.3, affectedShare: 0.5, lossMonth: 2, marketingMonths: 12, stocksToUse: 0.2, months: 16 });
    expect(path[0]).toBe(0);
    expect(path[1]).toBe(0);
    expect(path[2]).toBeCloseTo(0.12, 12);
    expect(path[13]).toBeCloseTo(0.12, 12);
    expect(path[14]).toBe(0);
  });
});

describe('manufacturingShortfall', () => {
  it('holds capacity out then ramps back', () => {
    const path = manufacturingShortfall({ capacityOutFraction: 0.2, outMonths: 4, rampMonths: 2, months: 8 });
    expect(path.slice(0, 4)).toEqual([0.2, 0.2, 0.2, 0.2]);
    expect(path[4]).toBeCloseTo(0.1, 12);
    expect(path[5]).toBeCloseTo(0, 12);
    expect(path[6]).toBe(0);
  });
});

describe('quarterlyMeans', () => {
  it('averages consecutive triples from an offset', () => {
    expect(quarterlyMeans([1, 2, 3, 4, 5, 6], 0)).toEqual([2, 5]);
    expect(quarterlyMeans([9, 1, 2, 3, 4, 5, 6], 1)).toEqual([2, 5]);
  });
});
