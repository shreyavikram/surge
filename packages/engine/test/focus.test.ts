import { describe, it, expect } from 'vitest';
import { loadContext, loadCase } from '@surge/config';
import { runThreat } from '../src/scenario.js';
import { consumptionShares, threatAffectsArea, areaLoss, perCapitaLossByArea, getArea } from '../src/focus.js';
import type { Threat } from '../src/types.js';

const ctx = loadContext();
const cfg = ctx.focus!;

describe('focus', () => {
  it('state consumption shares sum to one and scale with population', () => {
    const s = consumptionShares(cfg, 'state');
    const total = Object.values(s).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(s['CA']!).toBeGreaterThan(s['IA']!);
    expect(s['TX']!).toBeGreaterThan(0.08);
  });
  it('a domestic threat reaches only the states its region covers; foreign threats reach every state', () => {
    const iowa: Threat = { id: 'x', name: 'x', category: 'disease', kind: 'natural', location: { lat: 42, lng: -93.5, regionId: 'us-iowa' }, commodities: [{ id: 'eggs', relevance: 1 }], severity: 0.3, start: '2026-09', source: { feed: 't', kind: 'user' } };
    expect(threatAffectsArea(iowa, getArea(cfg, 'IA')!, cfg)).toBe(true);
    expect(threatAffectsArea(iowa, getArea(cfg, 'NY')!, cfg)).toBe(false);
    const mexico: Threat = { ...iowa, category: 'export_ban', kind: 'geopolitical', location: { lat: 23, lng: -102, regionId: 'mexico' }, commodities: [{ id: 'tomatoes', relevance: 1 }] };
    expect(threatAffectsArea(mexico, getArea(cfg, 'NY')!, cfg)).toBe(true);
    const national: Threat = { ...iowa, location: { lat: 39.8, lng: -98.6, regionId: 'us-national' } };
    expect(threatAffectsArea(national, getArea(cfg, 'NY')!, cfg)).toBe(true);
  });
  it('area consumer losses sum to the national loss across states', () => {
    const egg = loadCase('egg-2022').threats[0]!;
    const { impact } = runThreat(egg, ctx);
    const rows = perCapitaLossByArea(impact, ctx, 'state');
    expect(rows.reduce((a, r) => a + r.cv, 0)).toBeCloseTo(impact.welfare.cv, 3);
    expect(rows.find((r) => r.areaId === 'CA')!.perCapita).toBeGreaterThan(0);
  });
  it('an Iowa flock loss hurts Iowa producers and helps producers elsewhere', () => {
    const iowa: Threat = { id: 'x', name: 'x', category: 'disease', kind: 'natural', location: { lat: 42, lng: -93.5, regionId: 'us-iowa' }, commodities: [{ id: 'eggs', relevance: 1 }], severity: 0.5, start: '2026-09', months: 12, source: { feed: 't', kind: 'user' } };
    const { impact } = runThreat(iowa, ctx);
    const ia = areaLoss(impact, 'IA', ctx);
    const oh = areaLoss(impact, 'OH', ctx);
    expect(ia.producerRevenueChange['eggs']!).toBeLessThan(0);
    expect(oh.producerRevenueChange['eggs']!).toBeGreaterThan(0);
    expect(ia.cv).toBeGreaterThan(0);
    expect(ia.cvAnnual).toBeLessThanOrEqual(ia.cv + 1e-6);
  });
  it('an import block leaves US producers with a pure price gain', () => {
    const t: Threat = { id: 'm', name: 'm', category: 'export_ban', kind: 'geopolitical', location: { lat: 23, lng: -102, regionId: 'mexico' }, commodities: [{ id: 'tomatoes', relevance: 1 }], severity: 1, start: '2026-09', months: 6, source: { feed: 't', kind: 'user' } };
    const { impact } = runThreat(t, ctx);
    expect(impact.welfare.producerRevenueChange['tomatoes']!).toBeGreaterThan(0);
    expect(areaLoss(impact, 'FL', ctx).producerRevenueChange['tomatoes']!).toBeGreaterThan(0);
    expect(areaLoss(impact, 'NY', ctx).producerRevenueChange['tomatoes']!).toBe(0);
  });
});
