import { describe, it, expect } from 'vitest';
import { loadContext } from '@surge/config';
import { interpretScenario, validateCandidate, candidateToThreat, parseSeverity, parseMonths } from '../src/interpret.js';
import { runThreat } from '../src/scenario.js';

const ctx = loadContext();

describe('interpretScenario', () => {
  it('reads a chokepoint scenario with a strait, a commodity, and a severity', () => {
    const c = interpretScenario('Iran closes the Strait of Hormuz for 3 months, cutting fertilizer shipments by 60%', ctx);
    expect(c.length).toBeGreaterThan(0);
    expect(c[0]!.category).toBe('chokepoint');
    expect(c[0]!.regionId).toBe('hormuz');
    expect(c[0]!.commodities.map((x) => x.id)).toContain('fertilizer');
    expect(c[0]!.severity).toBeCloseTo(0.6, 9);
    expect(c[0]!.months).toBe(3);
    expect(validateCandidate(c[0]!, ctx)).toEqual([]);
  });
  it('reads an export ban and defaults to the region supply list when no commodity is named', () => {
    const c = interpretScenario('India bans all exports', ctx);
    expect(c[0]!.category).toBe('export_ban');
    expect(c[0]!.regionId).toBe('india-rice');
    expect(c[0]!.commodities.map((x) => x.id)).toEqual(['rice']);
    expect(c[0]!.severity).toBe(1);
  });
  it('reads a domestic disease event with a state', () => {
    const c = interpretScenario('Bird flu wipes out a quarter of Iowa layers', ctx);
    expect(c[0]!.category).toBe('disease');
    expect(c[0]!.regionId).toBe('us-iowa');
    expect(c[0]!.commodities.map((x) => x.id)).toEqual(['eggs']);
    expect(c[0]!.severity).toBe(0.25);
  });
  it('reads a tariff with a rate', () => {
    const c = interpretScenario('A 30% tariff on Mexican tomatoes and produce', ctx);
    expect(c[0]!.category).toBe('tariff');
    expect(c[0]!.regionId).toBe('mexico');
    expect(c[0]!.severity).toBeCloseTo(0.3, 9);
    expect(c[0]!.commodities.map((x) => x.id).sort()).toEqual(['fresh-vegetables', 'tomatoes']);
  });
  it('splits a multi-clause description into separate candidates', () => {
    const c = interpretScenario('India bans rice exports; drought in Iowa cuts corn 20%', ctx);
    expect(c.map((x) => x.category).sort()).toEqual(['drought', 'export_ban']);
    expect(c.find((x) => x.category === 'drought')!.severity).toBeCloseTo(0.2, 9);
  });
  it('returns nothing for text with no food-supply content', () => {
    expect(interpretScenario('The weather is nice today', ctx)).toEqual([]);
  });
  it('produces a threat the engine can run', () => {
    const c = interpretScenario('Drought in California cuts lettuce output by 20% for 6 months', ctx)[0]!;
    const t = candidateToThreat(c, ctx, 'sim-1', '2026-09');
    const r = runThreat(t, ctx);
    expect(r.impact.welfare.cv).toBeGreaterThan(0);
    expect(t.source.kind).toBe('user');
  });
  it('rejects an invalid candidate', () => {
    const p = validateCandidate({ name: 'x', category: 'drought', regionId: 'atlantis', commodities: [{ id: 'unicorns', relevance: 1 }], severity: 2, months: 0, confidence: 1, matched: [], source: 'llm' }, ctx);
    expect(p.length).toBeGreaterThanOrEqual(4);
  });
  it('parses severity and duration phrases', () => {
    expect(parseSeverity(' half of ')).toBe(0.5);
    expect(parseSeverity(' 45 percent ')).toBeCloseTo(0.45, 9);
    expect(parseMonths(' for 2 years ')).toBe(24);
    expect(parseMonths(' six weeks ')).toBeUndefined();
    expect(parseMonths(' 8 weeks ')).toBe(2);
  });
});
