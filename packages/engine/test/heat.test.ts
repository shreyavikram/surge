import { describe, it, expect } from 'vitest';
import { loadContext } from '@surge/config';
import { countryHeat, stateHeat, commodityImportWeights } from '../src/heat.js';
import type { Threat } from '../src/types.js';

const ctx = loadContext();
const mk = (over: Partial<Threat>): Threat => ({ id: 'x', name: 'x', category: 'export_ban', kind: 'geopolitical', location: { lat: 23, lng: -102, regionId: 'mexico', iso3: 'MEX' }, commodities: [{ id: 'tomatoes', relevance: 1 }], severity: 1, start: '2026-09', source: { feed: 't', kind: 'user' }, ...over });

describe('heat', () => {
  it('import weights sum to one', () => {
    const w = commodityImportWeights(ctx);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
  it('a country with no US food supply and no threats is grey (none)', () => {
    const h = countryHeat([], ctx);
    expect(h['MEX']!.status).toBe('stable');
    expect(h['PAK']!.status).toBe('stable'); // tiny but listed
    expect(h['ATA'] ?? { status: 'none' }).toMatchObject({ status: 'none' });
    expect(Object.values(h).every((x) => x.status !== 'stable' || x.baseline > 0)).toBe(true);
  });
  it('a supplier with no threats is stable, darker when it supplies more', () => {
    const h = countryHeat([], ctx);
    expect(h['MEX']!.status).toBe('stable');
    expect(h['MEX']!.intensity).toBeGreaterThan(h['PER']!.intensity);
    expect(h['CAN']!.intensity).toBeGreaterThan(0.5);
  });
  it('an active export ban turns the origin red with intensity from the import share lost', () => {
    const h = countryHeat([mk({})], ctx);
    expect(h['MEX']!.status).toBe('unstable');
    expect(h['MEX']!.disruption).toBeGreaterThan(0);
    expect(h['MEX']!.threats).toEqual(['x']);
    expect(h['CAN']!.status).toBe('stable');
  });
  it('a breaking item turns the origin yellow, scaled by confidence', () => {
    const lo = countryHeat([mk({ status: 'breaking', confidence: 0.2 })], ctx)['MEX']!;
    const hi = countryHeat([mk({ status: 'breaking', confidence: 0.9 })], ctx)['MEX']!;
    expect(lo.status).toBe('anticipated');
    expect(hi.intensity).toBeGreaterThan(lo.intensity);
  });
  it('active beats anticipated when both touch a country', () => {
    const h = countryHeat([mk({ id: 'a' }), mk({ id: 'b', status: 'breaking' })], ctx)['MEX']!;
    expect(h.status).toBe('unstable');
    expect(h.threats).toEqual(['a', 'b']);
  });
  it('states: production baseline and domestic disruption', () => {
    const none = stateHeat([], ctx);
    expect(none['CA']!.status).toBe('stable');
    expect(none['CA']!.intensity).toBeGreaterThan(none['RI']!.intensity);
    const iowa: Threat = mk({ id: 'h', category: 'disease', kind: 'natural', location: { lat: 42, lng: -93.5, regionId: 'us-iowa', iso3: 'USA' }, commodities: [{ id: 'eggs', relevance: 1 }], severity: 0.5 });
    const h = stateHeat([iowa], ctx);
    expect(h['IA']!.status).toBe('unstable');
    expect(h['NY']!.status).toBe('stable');
  });
});
