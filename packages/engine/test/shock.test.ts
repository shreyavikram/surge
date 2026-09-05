import { describe, it, expect } from 'vitest';
import { threatToShocks } from '../src/shock.js';
import { loadContext } from '@surge/config';
import type { Threat } from '../src/types.js';

const ctx = loadContext();
const base = (over: Partial<Threat>): Threat => ({
  id: 't', name: 'T', category: 'disease', kind: 'natural',
  location: { lat: 42, lng: -93.5, regionId: 'us-iowa' },
  commodities: [{ id: 'eggs', relevance: 1 }], severity: 1, start: '2024-01',
  source: { feed: 'test', kind: 'user' }, ...over,
});

describe('threatToShocks', () => {
  it('disease: severity is the fraction of the region flock lost → national path via region share and inventory', () => {
    // Iowa holds 15% of US layers; losing 2/3 of Iowa's flock = 10% of the national flock, offset 35%
    const [s] = threatToShocks(base({ severity: 2 / 3, months: 12 }), ctx);
    expect(s!.kind).toBe('supply');
    expect(s!.commodity).toBe('eggs');
    expect(s!.supplyPath[0]).toBeCloseTo(0.1 * 0.65, 6);
    expect(s!.supplyPath.length).toBe(12);
  });
  it('disease timeline shapes the loss over months without changing its magnitude', () => {
    const sev = 20e6 / (0.15 * 325e6);
    const [s] = threatToShocks(base({ severity: sev, physical: { kind: 'animals_affected', value: 20e6, timeline: [{ month: 0, value: 10e6 }, { month: 2, value: 10e6 }] }, months: 6 }), ctx);
    expect(s!.supplyPath[1]).toBeCloseTo(0.02, 6);
    expect(s!.supplyPath[2]).toBeCloseTo(0.04, 6);
  });
  it('a nationwide event uses the us-national region (share 1)', () => {
    const [s] = threatToShocks(base({ severity: 0.1, location: { lat: 39.8, lng: -98.6, regionId: 'us-national' }, months: 3 }), ctx);
    expect(s!.supplyPath[0]).toBeCloseTo(0.1 * 0.65, 6);
  });
  it('severity override scales the loss', () => {
    const t = base({ severity: 0.5, months: 3 });
    const [full] = threatToShocks(t, ctx);
    const [half] = threatToShocks(t, ctx, 0.25);
    expect(half!.supplyPath[0]).toBeCloseTo(full!.supplyPath[0]! / 2, 9);
    const [zero] = threatToShocks(t, ctx, 0);
    expect(zero!.supplyPath[0]).toBe(0);
  });
  it('drought: severity is the fraction of the region crop lost → national path via region share and stocks buffer', () => {
    const t = base({ category: 'drought', commodities: [{ id: 'potatoes', relevance: 1 }], location: { lat: 46, lng: -119, regionId: 'us-pacific-northwest' }, severity: 0.28, months: 12 });
    const [s] = threatToShocks(t, ctx);
    const nonzero = s!.supplyPath.filter((v) => v > 0);
    expect(nonzero.length).toBeGreaterThan(0);
    expect(Math.max(...nonzero)).toBeCloseTo(0.28 * 0.55 * 0.7, 6);
  });
  it('drought on an input region → cost shocks for every commodity using that input', () => {
    const t = base({ category: 'drought', commodities: [{ id: 'corn', relevance: 1 }], location: { lat: 42, lng: -93.5, regionId: 'us-iowa' }, severity: 0.35, months: 12 });
    const shocks = threatToShocks(t, ctx);
    const viaCorn = shocks.filter((s) => s.kind === 'cost' && s.via === 'corn');
    expect(viaCorn.map((s) => s.commodity).sort()).toEqual(['beef', 'chicken', 'eggs', 'milk', 'pork', 'turkey']);
    const eggs = viaCorn.find((s) => s.commodity === 'eggs')!;
    const peak = Math.max(...eggs.costPath!);
    expect(peak).toBeCloseTo(0.119 * (0.35 * 0.17 * 0.88) / (0.85 * 0.4 + 0.15 * 1.5), 5);
    expect(eggs.supplyPath.every((v) => v === 0)).toBe(true);
  });
  it('export ban from an origin → supply loss = import share × origin share × (1 − rerouting)', () => {
    const t = base({ category: 'export_ban', kind: 'geopolitical', commodities: [{ id: 'tomatoes', relevance: 1 }], location: { lat: 23, lng: -102, regionId: 'mexico' }, severity: 1, months: 6 });
    const [s] = threatToShocks(t, ctx);
    expect(s!.supplyPath[0]).toBeCloseTo(0.6 * 0.9 * 1 * (1 - 0.3), 6);
    expect(s!.supplyPath.length).toBe(6);
  });
  it('tariff: severity is the ad valorem rate → cost path = rate × import share × origin share', () => {
    const t = base({ category: 'tariff', kind: 'geopolitical', commodities: [{ id: 'bananas', relevance: 1 }], location: { lat: 10, lng: -84, regionId: 'central-america-bananas' }, severity: 0.25, months: 12 });
    const [s] = threatToShocks(t, ctx);
    expect(s!.kind).toBe('cost');
    expect(s!.costPath![0]).toBeCloseTo(0.25 * 1.0 * 0.95, 6);
  });
  it('chokepoint → delay shortfall and freight wedge on an input, propagated to commodities', () => {
    const t = base({ category: 'chokepoint', kind: 'geopolitical', commodities: [{ id: 'fertilizer', relevance: 1 }], location: { lat: 26.6, lng: 56.3, regionId: 'hormuz' }, severity: 0.5, months: 3 });
    const shocks = threatToShocks(t, ctx);
    expect(shocks.every((s) => s.kind === 'cost' && s.via === 'fertilizer')).toBe(true);
    expect(shocks.map((s) => s.commodity).sort()).toEqual(['potatoes', 'rice']);
  });
  it('war in an exporting region → world price shock × import exposure', () => {
    const t = base({ category: 'war', kind: 'geopolitical', commodities: [{ id: 'wheat', relevance: 1 }], location: { lat: 48, lng: 35, regionId: 'black-sea' }, severity: 1, months: 6 });
    const shocks = threatToShocks(t, ctx);
    const bread = shocks.find((s) => s.commodity === 'bread')!;
    expect(bread.costPath![0]).toBeCloseTo(0.28 * 0.5 * 0.45 * 0.06, 6);
  });
  it('import_dependence produces no shock', () => {
    expect(threatToShocks(base({ category: 'import_dependence', kind: 'geopolitical' }), ctx)).toEqual([]);
  });
  it('facility: severity is the fraction of national capacity offline → manufacturing path', () => {
    const t = base({ category: 'facility', kind: 'geopolitical', commodities: [{ id: 'infant-formula', relevance: 1 }], location: { lat: 41.8, lng: -85.4 }, severity: 0.2, months: 9 });
    const [s] = threatToShocks(t, ctx);
    expect(s!.supplyPath[0]).toBeCloseTo(0.2, 9);
    expect(s!.supplyPath[7]).toBeCloseTo(0.1, 9);
    expect(s!.supplyPath[8]).toBe(0);
  });
});
