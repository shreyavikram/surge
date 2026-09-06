// packages/engine/src/mitigation.ts
import type { LeverConfig, LeverResult, MitigationPlan } from './types.js';

export const DOES_THE_WORK_SHARE = 0.25;  // of cumulative gap
export const MARGINAL_SHARE = 0.10;       // of cumulative gap
const CLOSE_THRESHOLD = 0.95;

function effectiveLead(l: LeverConfig, byId: Map<string, LeverConfig>, seen = new Set<string>()): number {
  if (!l.requires || seen.has(l.id)) return l.leadMonths;
  seen.add(l.id);
  const req = byId.get(l.requires);
  return req ? Math.max(l.leadMonths, effectiveLead(req, byId, seen)) : l.leadMonths;
}

/** Last month (exclusive) a lever is available: its own window, further bounded by its requirement's window. */
function effectiveEnd(l: LeverConfig, byId: Map<string, LeverConfig>, lead: Map<string, number>, seen = new Set<string>()): number {
  const own = l.activeMonths !== undefined ? (lead.get(l.id) ?? l.leadMonths) + l.activeMonths : Number.POSITIVE_INFINITY;
  if (!l.requires || seen.has(l.id)) return own;
  seen.add(l.id);
  const req = byId.get(l.requires);
  return req ? Math.min(own, effectiveEnd(req, byId, lead, seen)) : own;
}

/**
 * Close a monthly physical gap with the commodity's levers (methodology §5).
 * Demand-side levers ration first; supply levers are allocated cheapest-first subject to lead,
 * ramp, stock, and unlock caps; regulatory levers are credited with what they enable.
 */
export function planMitigation(gap: number[], allLevers: LeverConfig[], opts: { commodity: string; unit: string; activate?: string[]; deactivate?: string[]; offset?: boolean }): MitigationPlan {
  const n = gap.length;
  const forCommodity = allLevers.filter((l) => l.commodity === opts.commodity);
  const isActive = (l: LeverConfig) => (l.enabledByDefault || (opts.activate ?? []).includes(l.id)) && !(opts.deactivate ?? []).includes(l.id);
  // a lever whose requirement is switched off is unavailable too (repeat until stable for chains)
  const known = new Set(allLevers.map((l) => l.id));
  let active = forCommodity.filter(isActive);
  for (let changed = true; changed;) {
    const ids = new Set(active.map((l) => l.id));
    const next = active.filter((l) => !l.requires || !known.has(l.requires) || ids.has(l.requires));
    changed = next.length !== active.length;
    active = next;
  }
  const inactive = forCommodity.filter((l) => !active.includes(l));
  const byId = new Map(active.map((l) => [l.id, l] as const));
  const lead = new Map(active.map((l) => [l.id, effectiveLead(l, byId)] as const));
  const end = new Map(active.map((l) => [l.id, effectiveEnd(l, byId, lead)] as const));
  const units = new Map(active.map((l) => [l.id, new Array<number>(n).fill(0)] as const));
  const remainingStock = new Map<string, number>();
  for (const l of active) if (l.stock !== undefined) remainingStock.set(l.id, l.stock);
  const enabled = new Map<string, number>(active.map((l) => [l.id, 0]));

  const covered: number[] = new Array(n).fill(0);
  const rationed: number[] = new Array(n).fill(0);
  const supplyLevers = active.filter((l) => l.type !== 'regulatory' && l.type !== 'demand_side');
  const demandLevers = active.filter((l) => l.type === 'demand_side');

  for (let t = 0; t < n; t++) {
    const g = gap[t] ?? 0;
    if (g <= 0) continue;
    for (const d of demandLevers) {
      if (t < (lead.get(d.id) ?? 0) || t >= (end.get(d.id) ?? Infinity)) continue;
      const r = g * (d.rationingShare ?? 0);
      units.get(d.id)![t] = r;
      rationed[t]! += r;
    }
    let remaining = Math.max(0, g - rationed[t]!);
    const avail = supplyLevers.filter((l) => t >= (lead.get(l.id) ?? 0) && t < (end.get(l.id) ?? Infinity)).sort((a, b) => a.unitCost - b.unitCost);
    for (const l of avail) {
      if (remaining <= 0) break;
      const ld = lead.get(l.id) ?? 0;
      const ramp = Math.min(1, (t - ld + 1) / Math.max(1, l.rampMonths));
      let cap = l.capacityPerMonth * ramp;
      if (remainingStock.has(l.id)) cap = Math.min(cap, remainingStock.get(l.id)!);
      if (l.requires && remainingStock.has(l.requires)) cap = Math.min(cap, remainingStock.get(l.requires)!);
      const take = Math.max(0, Math.min(cap, remaining));
      if (take <= 0) continue;
      units.get(l.id)![t] = take;
      remaining -= take;
      covered[t]! += take;
      if (remainingStock.has(l.id)) remainingStock.set(l.id, remainingStock.get(l.id)! - take);
      if (l.requires) {
        enabled.set(l.requires, (enabled.get(l.requires) ?? 0) + take);
        if (remainingStock.has(l.requires)) remainingStock.set(l.requires, remainingStock.get(l.requires)! - take);
      }
    }
  }

  const cumulativeGap = gap.reduce((a, b) => a + Math.max(0, b), 0);
  const coverage = gap.map((g, t) => (g > 0 ? (covered[t]! + rationed[t]!) / g : 1));
  const delivered = covered.reduce((a, b) => a + b, 0) + rationed.reduce((a, b) => a + b, 0);
  const levers: LeverResult[] = active.map((l) => {
    const path = units.get(l.id)!;
    const cumulative = path.reduce((a, b) => a + b, 0);
    const enabledUnits = enabled.get(l.id) ?? 0;
    const basis = l.type === 'regulatory' ? enabledUnits : cumulative;
    const share = cumulativeGap > 0 ? basis / cumulativeGap : 0;
    const reliefShare = delivered > 0 ? basis / delivered : 0;
    const used = basis > 0;
    const classification: LeverResult['classification'] = !used ? 'unused' : share >= DOES_THE_WORK_SHARE ? 'does the work' : share >= MARGINAL_SHARE ? 'contributes' : 'marginal';
    return { id: l.id, name: l.name, type: l.type, unitsPath: path, cumulative, share, reliefShare, enabledUnits,
      cost: used ? cumulative * l.unitCost + l.fixedCost : 0, leadMonths: lead.get(l.id) ?? l.leadMonths, precedent: l.precedent, classification };
  });
  for (const l of inactive) {
    levers.push({ id: l.id, name: l.name, type: l.type, unitsPath: new Array<number>(n).fill(0), cumulative: 0, share: 0, reliefShare: 0, enabledUnits: 0,
      cost: 0, leadMonths: l.leadMonths, precedent: l.precedent, classification: 'unused' });
  }
  const totalCost = levers.reduce((a, l) => a + l.cost, 0);
  let timeToCloseMonths: number | null = null;
  for (let t = 0; t < n; t++) {
    if (coverage.slice(t).every((c) => c >= CLOSE_THRESHOLD)) { timeToCloseMonths = t; break; }
  }
  return { commodity: opts.commodity, unit: opts.unit, gap, covered, coverage, rationed, levers, totalCost, timeToCloseMonths, cumulativeGap,
    uncoveredShare: cumulativeGap > 0 ? 1 - delivered / cumulativeGap : 0,
    offset: opts.offset ?? false };
}
