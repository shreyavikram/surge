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
    expect(c[0]!.regionId).toBe('india');
    expect(c[0]!.commodities.map((x) => x.id)).toEqual(['rice']);
    expect(c[0]!.severity).toBe(1);
  });
  it('reads a domestic disease event with a state', () => {
    const c = interpretScenario('Bird flu wipes out a quarter of Iowa layers', ctx);
    expect(c[0]!.category).toBe('disease');
    expect(c[0]!.regionId).toBe('us-state-IA');
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
    expect(parseSeverity(' 45 percent of the crop lost ')).toBeCloseTo(0.45, 9);
    expect(parseMonths(' for 2 years ')).toBe(24);
    expect(parseMonths(' six weeks ')).toBeUndefined();
    expect(parseMonths(' 8 weeks ')).toBe(2);
  });
});

describe('interpretScenario matches terms as whole words', () => {
  it('does not read "Warm" as war: a Florida citrus sentence has no explicit category', () => {
    const c = interpretScenario('Warm winter helps Florida citrus growers', ctx);
    expect(c.length).toBeGreaterThan(0);
    expect(c.some((x) => x.category === 'war')).toBe(false);
    expect(c[0]!.regionId).toBe('us-state-FL');
    expect(c[0]!.explicitCategory).toBe(false);
    expect(c[0]!.confidence).toBeLessThan(1);
  });
  it('does not read "prices" as rice', () => {
    const c = interpretScenario('Egg prices soar across the United States after bird flu', ctx);
    expect(c).toHaveLength(1);
    expect(c[0]!.category).toBe('disease');
    expect(c[0]!.regionId).toBe('us-national');
    expect(c[0]!.commodities.map((x) => x.id)).toEqual(['eggs']);
  });
  it('does not read "Indiana" as India', () => {
    const c = interpretScenario('Drought in Indiana', ctx);
    expect(c).toHaveLength(1);
    expect(c[0]!.category).toBe('drought');
    expect(c[0]!.regionId).toBe('us-state-IN');
    expect(c[0]!.commodities.map((x) => x.id)).not.toContain('rice');
  });
  it('does not read "couple", "Moscow", "soils" or "hails" as coup, cow, oils or hail', () => {
    expect(interpretScenario('Governor hails a couple of new soils reports from Moscow', ctx)).toEqual([]);
  });
  it('still matches plurals, stems and compound weather nouns', () => {
    const c = interpretScenario('Flooding inundates Arkansas rice fields', ctx);
    expect(c[0]!.category).toBe('flood');
    expect(c[0]!.regionId).toBe('us-state-AR');
    expect(c[0]!.matched).toEqual(expect.arrayContaining(['flood', 'inundat']));
    expect(c[0]!.commodities.map((x) => x.id)).toEqual(['rice']);
    expect(interpretScenario('Hailstorms flatten Nebraska corn', ctx)[0]!.category).toBe('storm');
  });
  it('keeps New Mexico as a state rather than Mexico', () => {
    expect(interpretScenario('Drought in New Mexico', ctx).map((x) => x.regionId)).toEqual(['us-state-NM']);
  });
});

describe('a percentage is severity only next to loss language', () => {
  it('ignores a price percentage and falls back to the category default', () => {
    const c = interpretScenario('Egg prices up 60% in Iowa amid bird flu', ctx);
    expect(c[0]!.category).toBe('disease');
    expect(c[0]!.regionId).toBe('us-state-IA');
    expect(c[0]!.commodities.map((x) => x.id)).toEqual(['eggs']);
    expect(c[0]!.severity).toBeCloseTo(0.15, 9);
  });
  it('reads a loss percentage', () => {
    expect(interpretScenario('Bird flu destroys 60% of Iowa layers', ctx)[0]!.severity).toBeCloseTo(0.6, 9);
    expect(interpretScenario('Bird flu: 40% of the flock culled in Iowa', ctx)[0]!.severity).toBeCloseTo(0.4, 9);
  });
  it('prefers the percentage nearest a loss word when a price move is also quoted', () => {
    const c = interpretScenario('Corn prices up 30% after drought cuts yields 15% in Iowa', ctx);
    expect(c[0]!.category).toBe('drought');
    expect(c[0]!.severity).toBeCloseTo(0.15, 9);
  });
  it('parseSeverity applies the same rule on its own', () => {
    expect(parseSeverity(' prices up 45 percent ')).toBeUndefined();
    expect(parseSeverity(' inflation of 12% ')).toBeUndefined();
    expect(parseSeverity(' 45 percent of the crop lost ')).toBeCloseTo(0.45, 9);
    expect(parseSeverity(' a 30% tariff ')).toBeCloseTo(0.3, 9);
    expect(parseSeverity(' output down 8% ')).toBeCloseTo(0.08, 9);
  });
});

describe('clause splitting protects abbreviations and decimals', () => {
  it('does not split "U.S." into a spurious clause', () => {
    const c = interpretScenario('Drought across the U.S. corn belt', ctx);
    expect(c).toHaveLength(1);
    expect(c[0]!.category).toBe('drought');
    expect(c[0]!.regionId).toBe('us-midwest-corn-belt');
    expect(c[0]!.commodities.map((x) => x.id)).toContain('corn');
    expect(c.some((x) => x.category === 'export_ban')).toBe(false);
  });
  it('does not split a decimal but still splits sentences', () => {
    const c = interpretScenario('Drought cuts Iowa corn by 2.5 million bushels. India bans rice exports.', ctx);
    expect(c.map((x) => x.category).sort()).toEqual(['drought', 'export_ban']);
    expect(c.find((x) => x.category === 'drought')!.regionId).toBe('us-state-IA');
  });
});

describe('measured supplier countries are addressable by name', () => {
  it('reads "Drought in Chile" onto the chile region with the commodities Chile ships to the US', () => {
    const c = interpretScenario('Drought in Chile', ctx);
    expect(c.length).toBeGreaterThan(0);
    expect(c[0]!.regionId).toBe('chile');
    const ids = c[0]!.commodities.map((x) => x.id);
    expect(ids).toContain('apples');
    expect(ids).not.toContain('pork'); // 0.6% of US pork imports: below the 5% floor
  });
});
