import { describe, it, expect } from 'vitest';
import { cvSecondOrder, csConstantElasticity } from '../src/welfare.js';

/**
 * Mitchell, Thompson, Malone (2025), Fryar Center FC-2025-001, Table 1:
 * retail price $2.73/doz (no-HPAI 2024), 202 shell eggs per capita, own-price elasticity -0.228,
 * price +9%, quantity -2%, consumer surplus loss $1,414.28M.
 * Population: 340.1M (Census Vintage 2024). The report does not state its population base;
 * the published figure is consistent with a rectangle approximation at about 342M people.
 */
describe('Fryar 2024 egg calibration', () => {
  const population = 340.1e6;
  const dozens = (202 / 12) * population;
  const X0 = dozens * 2.73;
  const pi = 0.09;
  const eps = -0.228;
  const published = 1414.28e6;

  it('single-good constant-elasticity CS reproduces the published loss within 2%', () => {
    const cs = csConstantElasticity(X0, pi, eps);
    expect(Math.abs(cs - published) / published).toBeLessThan(0.02);
  });
  it('second-order CV reproduces the published loss within 2%', () => {
    const cv = cvSecondOrder([X0], [[eps]], [pi]).cv;
    expect(Math.abs(cv - published) / published).toBeLessThan(0.02);
  });
  it('quantity falls about 2% as published', () => {
    expect(eps * pi).toBeCloseTo(-0.0205, 3);
  });
  it('welfare loss is insensitive to elasticity for a given price change (first-order dominates)', () => {
    const lo = cvSecondOrder([X0], [[-0.11]], [pi]).cv;
    const hi = cvSecondOrder([X0], [[-0.27]], [pi]).cv;
    expect(Math.abs(lo - hi) / lo).toBeLessThan(0.01);
  });
});
