import { describe, it, expect } from 'vitest';
import { runScenario, combineScenarios, compareScenarios, findConflicts, rankThreats, runThreat, conflictKey } from '../src/scenario.js';
import { loadContext, loadCase } from '@surge/config';
import type { Scenario, ScenarioThreat } from '../src/types.js';

const ctx = loadContext();
const egg = loadCase('egg-2022').threats[0]!;
const formula = loadCase('formula-2022').threats[0]!;
const sc = (id: string, threats: ScenarioThreat[]): Scenario => ({ id, name: id, threats, createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-05T00:00:00Z' });

describe('runScenario', () => {
  it('runs every threat through impact and mitigation', () => {
    const r = runScenario(sc('s', [egg, formula]), ctx);
    expect(r.impact.commodities).toEqual(['eggs', 'infant-formula']);
    expect(Object.keys(r.mitigation).sort()).toEqual(['eggs', 'infant-formula']);
    expect(r.impact.welfare.cv).toBeGreaterThan(0);
  });
  it('applies severity overrides and scenario assumption overrides', () => {
    const half = runScenario(sc('h', [{ ...egg, severityOverride: egg.severity / 2 }]), ctx);
    const full = runScenario(sc('f', [egg]), ctx);
    expect(half.impact.welfare.cv).toBeLessThan(full.impact.welfare.cv);
    const zero = runScenario(sc('z', [{ ...egg, severityOverride: 0 }]), ctx);
    expect(zero.impact.welfare.cv).toBe(0);
    const lessElastic = runScenario({ ...sc('e', [egg]), overrides: { elasticity: { eggs: -0.11 } } }, ctx);
    expect(lessElastic.impact.welfare.cv).toBeGreaterThan(full.impact.welfare.cv);
  });
});

describe('combine', () => {
  it('unions distinct threats and is order independent', () => {
    const a = sc('a', [egg]), b = sc('b', [formula]);
    const ab = combineScenarios(a, b, ctx, {}).scenario!, ba = combineScenarios(b, a, ctx, {}).scenario!;
    expect(ab.threats.map((t) => t.id).sort()).toEqual(['hpai-2022', 'sturgis-2022']);
    expect(runScenario(ab, ctx).impact.welfare.cv).toBeCloseTo(runScenario(ba, ctx).impact.welfare.cv, 6);
  });
  it('flags conflicting versions of the same commodity-region threat and resolves by choice', () => {
    const a = sc('a', [egg]);
    const b = sc('b', [{ ...egg, id: 'hpai-2022-worse', name: 'worse', severity: 0.2 }]);
    const conflicts = findConflicts(a, b, ctx);
    expect(conflicts).toHaveLength(1);
    expect(combineScenarios(a, b, ctx, {}).scenario).toBeUndefined();
    const keepB = combineScenarios(a, b, ctx, { [conflictKey(conflicts[0]!)]: 'b' }).scenario!;
    expect(keepB.threats.map((t) => t.id)).toEqual(['hpai-2022-worse']);
  });
  it('joint welfare is computed on the joint price vector', () => {
    const both = runScenario(sc('both', [egg, formula]), ctx).impact.welfare.cv;
    const sum = runScenario(sc('e', [egg]), ctx).impact.welfare.cv + runScenario(sc('f', [formula]), ctx).impact.welfare.cv;
    expect(Math.abs(both - sum) / sum).toBeLessThan(0.05);
  });
});

describe('compare and rank', () => {
  it('produces one row per scenario with the metrics that matter', () => {
    const rows = compareScenarios([runScenario(sc('a', [egg]), ctx), runScenario(sc('b', [formula]), ctx)]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.worstCommodity).toBe('eggs');
    expect(rows[1]!.worstCommodity).toBe('infant-formula');
    expect(typeof rows[0]!.mitigationCost).toBe('number');
    expect(rows[0]!.incidence).toHaveLength(5);
  });
  it('ranks threats by welfare loss descending', () => {
    const ranked = rankThreats([formula, egg], ctx);
    expect(ranked[0]!.cv).toBeGreaterThanOrEqual(ranked[1]!.cv);
    expect(ranked.map((r) => r.threat.id)).toContain('hpai-2022');
  });
  it('runThreat returns mitigation keyed by commodity', () => {
    expect(Object.keys(runThreat(egg, ctx).mitigation)).toEqual(['eggs']);
  });
});
