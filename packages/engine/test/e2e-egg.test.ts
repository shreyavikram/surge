import { describe, it, expect } from 'vitest';
import { runScenario } from '../src/scenario.js';
import { loadContext, loadCase } from '@surge/config';

/** The egg shock end to end: case file → shocks → impact (observed path, published attribution) → mitigation. */
describe('egg 2022 end to end', () => {
  const ctx = loadContext();
  const c = loadCase('egg-2022');
  const r = runScenario({ id: 'egg-2022', name: c.name, threats: c.threats, overrides: { pricePath: 'observed' }, createdAt: '', updatedAt: '' }, ctx, { observed: c.observed! });
  it('produces a retail price path from FRED with attribution', () => {
    expect(r.impact.price.path).toBe('observed');
    expect(Math.max(...r.impact.price.retailPct['eggs']!)).toBeGreaterThan(0.5);
  });
  it('lands the 2022 welfare loss between the two published estimates for 2022', () => {
    // the observed series now runs through 2023 (the Jan 2023 peak and the fall back); the published figures are for calendar 2022
    expect(r.impact.welfare.cvAnnual).toBeGreaterThan(0.93e9);
    expect(r.impact.welfare.cvAnnual).toBeLessThan(4.1e9);
  });
  it('shows the physical shortfall and a mitigation plan dominated by biology', () => {
    expect(Math.max(...r.impact.shortfall['eggs']!.units)).toBeGreaterThan(20e6);
    expect(r.mitigation['eggs']!.uncoveredShare).toBeGreaterThan(0.5);
  });
  it('exposes the assumptions an economist would ask about', () => {
    const keys = r.impact.assumptions.map((a) => a.key);
    for (const k of ['elasticity.eggs', 'passThrough.eggs', 'recovery.eggs', 'offset.eggs', 'attribution.eggs', 'pricePath', 'demandSystem']) expect(keys).toContain(k);
  });
});
