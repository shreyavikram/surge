// packages/engine/src/scenario.ts
import type { EngineContext, Threat, Shock, ImpactResult, MitigationPlan, Scenario, ScenarioResult, ScenarioThreat, Conflict, CompareRow, CaseFile } from './types.js';
import { threatToShocks } from './shock.js';
import { computeImpact } from './impact.js';
import { planMitigation } from './mitigation.js';
import { monthIndex } from './months.js';

/**
 * Supply needed to return retail price to baseline after a cost or tariff shock (methodology §2 inverted):
 * s* = π_r × |(1−x)ε + xεₓ/θ|, in units per month.
 */
export function offsetGap(impact: ImpactResult, id: string, ctx: EngineContext): number[] {
  const c = ctx.commodities[id]!;
  const eps = ctx.overrides?.elasticity?.[id] ?? c.demand.ownPrice;
  const theta = ctx.overrides?.passThrough?.[id] ?? c.transmission.passThrough;
  const denom = Math.abs((1 - c.trade.exportShare) * eps + (c.trade.exportShare * c.trade.exportElasticity) / theta);
  return (impact.price.retailPct[id] ?? []).map((pi) => (pi > 0 ? pi * denom * (c.baseline.annualQuantity / 12) : 0));
}

function mitigationFor(impact: ImpactResult, ctx: EngineContext): Record<string, MitigationPlan> {
  const out: Record<string, MitigationPlan> = {};
  for (const id of impact.commodities) {
    const sf = impact.shortfall[id]!;
    const physical = sf.units.some((u) => u > 0);
    const gap = physical ? sf.units : offsetGap(impact, id, ctx);
    out[id] = planMitigation(gap, ctx.levers, { commodity: id, unit: sf.unit, offset: !physical });
  }
  return out;
}

export function runThreat(threat: Threat, ctx: EngineContext, severityOverride?: number, opts?: { observed?: CaseFile['observed'] }): { shocks: Shock[]; impact: ImpactResult; mitigation: Record<string, MitigationPlan> } {
  const shocks = threatToShocks(threat, ctx, severityOverride);
  const impact = computeImpact(shocks, ctx, opts);
  return { shocks, impact, mitigation: mitigationFor(impact, ctx) };
}

/** Watchlist order: every threat run alone, ranked by consumer welfare loss. */
export function rankThreats(threats: Threat[], ctx: EngineContext): { threat: Threat; cv: number; worstCommodity: string; durationMonths: number }[] {
  return threats.map((threat) => {
    const { impact } = runThreat(threat, ctx);
    const worst = Object.entries(impact.welfare.byCommodity).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    return { threat, cv: impact.welfare.cv, worstCommodity: worst, durationMonths: impact.durationMonths };
  }).sort((a, b) => b.cv - a.cv);
}

export function runScenario(scenario: Scenario, ctx: EngineContext, opts?: { observed?: CaseFile['observed'] }): ScenarioResult {
  const c: EngineContext = { ...ctx, overrides: { ...(ctx.overrides ?? {}), ...(scenario.overrides ?? {}) } };
  const shocks = scenario.threats.flatMap((t) => threatToShocks(t, c, t.severityOverride));
  const impact = computeImpact(shocks, c, opts);
  return { scenario, shocks, impact, mitigation: mitigationFor(impact, c) };
}

function span(t: ScenarioThreat, ctx: EngineContext): { start: string; months: number } {
  return { start: t.start, months: t.months ?? ctx.threatTypes[t.category]?.defaultMonths ?? 6 };
}

function overlaps(a: ScenarioThreat, b: ScenarioThreat, ctx: EngineContext): boolean {
  const sa = span(a, ctx), sb = span(b, ctx);
  const off = monthIndex(sa.start, sb.start);
  return off < sa.months && -off < sb.months;
}

export function conflictKey(c: Conflict): string {
  return `${c.commodity}|${c.region}|${c.a.id}|${c.b.id}`;
}

/** Two versions of a threat on the same commodity and region with overlapping months conflict; identical threats union silently. */
export function findConflicts(a: Scenario, b: Scenario, ctx: EngineContext): Conflict[] {
  const out: Conflict[] = [];
  for (const ta of a.threats) for (const tb of b.threats) {
    if (JSON.stringify(ta) === JSON.stringify(tb)) continue;
    const ra = ta.location.regionId ?? 'unknown', rb = tb.location.regionId ?? 'unknown';
    if (ra !== rb) continue;
    const shared = ta.commodities.map((c) => c.id).filter((id) => tb.commodities.some((c) => c.id === id));
    if (shared.length === 0 || !overlaps(ta, tb, ctx)) continue;
    for (const commodity of shared) out.push({ commodity, region: ra, a: ta, b: tb });
  }
  return out;
}

export function combineScenarios(a: Scenario, b: Scenario, ctx: EngineContext, resolutions: Record<string, 'a' | 'b'>, name?: string): { scenario?: Scenario; conflicts: Conflict[] } {
  const conflicts = findConflicts(a, b, ctx);
  const unresolved = conflicts.filter((c) => !resolutions[conflictKey(c)]);
  if (unresolved.length > 0) return { conflicts };
  const drop = new Set<string>();
  for (const c of conflicts) { const keep = resolutions[conflictKey(c)]; drop.add(keep === 'a' ? c.b.id : c.a.id); }
  const byId = new Map<string, ScenarioThreat>();
  for (const t of [...a.threats, ...b.threats]) if (!drop.has(t.id)) byId.set(t.id, t);
  const threats = [...byId.values()].sort((x, y) => x.id.localeCompare(y.id));
  const now = new Date().toISOString();
  const scenario: Scenario = { id: `${a.id}+${b.id}`, name: name ?? `${a.name} + ${b.name}`, threats, createdAt: now, updatedAt: now };
  const overrides = { ...(a.overrides ?? {}), ...(b.overrides ?? {}) };
  if (Object.keys(overrides).length > 0) scenario.overrides = overrides;
  return { conflicts, scenario };
}

export function compareScenarios(results: ScenarioResult[]): CompareRow[] {
  return results.map((r) => {
    const by = r.impact.welfare.byCommodity;
    const worst = Object.entries(by).sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
    const plans = Object.values(r.mitigation);
    const times = plans.map((p) => p.timeToCloseMonths).filter((t): t is number => t !== null);
    return {
      scenarioId: r.scenario.id, name: r.scenario.name, totalCV: r.impact.welfare.cv, byCommodity: by, worstCommodity: worst,
      mitigationCost: plans.reduce((a, p) => a + p.totalCost, 0),
      timeToRecoverMonths: plans.length > 0 && times.length === plans.length ? Math.max(...times, r.impact.durationMonths) : null,
      incidence: r.impact.welfare.incidence,
    };
  });
}
