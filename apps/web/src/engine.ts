// Thin client wrapper over @surge/engine + @surge/config. The engine is authoritative;
// this module wires config in, assembles the threat list for a tab, and scales results to a focus area.
import { loadContext, loadCase, type CaseId } from '@surge/config';
import {
  runThreat, runScenario, compareScenarios, interpretScenario, candidateToThreat, validateCandidate,
  areaLoss, threatAffectsArea, perCapitaLossByArea, producerChangeByArea, getArea,
  type EngineContext, type Threat, type ThreatCategory, type ImpactResult, type CaseFile, type MitigationPlan, type AreaLoss, type ThreatCandidate, type Scenario, type AreaInfo,
} from '@surge/engine';
import { SEED_THREATS } from './seed.js';
import type { TabDef, Focus } from './state.js';

export { runThreat, runScenario, compareScenarios, interpretScenario, candidateToThreat, validateCandidate, areaLoss, perCapitaLossByArea, producerChangeByArea, getArea, loadCase };
export type { EngineContext, Threat, ThreatCategory, ImpactResult, CaseFile, CaseId, MitigationPlan, AreaLoss, ThreatCandidate, Scenario };

let _ctx: EngineContext | null = null;
export function getContext(): EngineContext {
  if (!_ctx) _ctx = loadContext();
  return _ctx;
}

// ---- Category → color family --------------------------------------------------
export { categoryFamily, type CategoryFamily } from '@surge/engine';
import { categoryFamily, type CategoryFamily } from '@surge/engine';
export const FAMILY_COLOR: Record<CategoryFamily, string> = { geopolitical: '#f5a623', natural: '#ff6a5b', biological: '#b57bff', supply: '#2dd4bf' };
export function categoryColor(cat: ThreatCategory): string { return FAMILY_COLOR[categoryFamily(cat)]; }
export const CATEGORY_LABEL: Record<ThreatCategory, string> = {
  tariff: 'Tariff', embargo: 'Embargo', export_ban: 'Export ban', import_decline: 'Import decline', war: 'War', instability: 'Instability', chokepoint: 'Chokepoint', import_dependence: 'Import dependence',
  drought: 'Drought', heat: 'Heat', flood: 'Flood', storm: 'Storm', wildfire: 'Wildfire', pest: 'Pest', disease: 'Disease', input_cost: 'Input cost', facility: 'Facility',
};

// ---- Threat list ---------------------------------------------------------------
export type ThreatOrigin = 'seed' | 'replay' | 'live' | 'user';
export interface ThreatEntry { threat: Threat; origin: ThreatOrigin; observed?: CaseFile['observed']; note?: string }

const REPLAY_CASES: CaseId[] = ['egg-2022', 'formula-2022'];

/** Base list: live feed threats when the server supplies them, else seeds; plus the calibrated replays. */
export function buildBaseList(live?: Threat[]): ThreatEntry[] {
  const entries: ThreatEntry[] = live && live.length > 0
    ? live.map((threat) => ({ threat, origin: 'live' as const }))
    : SEED_THREATS.map((threat) => ({ threat, origin: 'seed' as const }));
  for (const id of REPLAY_CASES) {
    const c = loadCase(id);
    for (const threat of c.threats) {
      const e: ThreatEntry = { threat, origin: 'replay', note: c.description };
      if (c.observed) e.observed = c.observed;
      entries.push(e);
    }
  }
  return entries;
}

/** Apply a tab's dials, removals, and additions to the base list. */
export function entriesForTab(base: ThreatEntry[], tab: TabDef): ThreatEntry[] {
  const out: ThreatEntry[] = [];
  for (const e of base) {
    if (tab.removed.includes(e.threat.id)) continue;
    const o = tab.overrides[e.threat.id];
    if (!o) { out.push(e); continue; }
    const threat: Threat = { ...e.threat };
    if (o.severity !== undefined) threat.severity = o.severity;
    if (o.months !== undefined) threat.months = o.months;
    out.push({ ...e, threat });
  }
  for (const t of tab.added) {
    const o = tab.overrides[t.id];
    const threat: Threat = { ...t };
    if (o?.severity !== undefined) threat.severity = o.severity;
    if (o?.months !== undefined) threat.months = o.months;
    out.push({ threat, origin: 'user' });
  }
  return out;
}

const runCache = new Map<string, ReturnType<typeof runThreat>>();
/** Runs are pure functions of the threat and the context overrides, so they are cached by content. */
export function runEntry(entry: ThreatEntry, ctx: EngineContext) {
  const key = `${JSON.stringify(entry.threat)}|${JSON.stringify(ctx.overrides ?? {})}|${entry.observed ? 'obs' : ''}`;
  const hit = runCache.get(key);
  if (hit) return hit;
  const r = runThreat(entry.threat, ctx, undefined, entry.observed ? { observed: entry.observed } : undefined);
  if (runCache.size > 400) runCache.delete(runCache.keys().next().value as string);
  runCache.set(key, r);
  return r;
}

export interface RankedEntry extends ThreatEntry {
  cv: number;              // national
  cvAnnual: number;
  worstCommodity: string;
  durationMonths: number;
  impact: ImpactResult;
  mitigation: Record<string, MitigationPlan>;
}

/** Every entry run alone, ranked by national consumer welfare loss. */
export function rankEntries(entries: ThreatEntry[], ctx: EngineContext): RankedEntry[] {
  const out: RankedEntry[] = [];
  for (const entry of entries) {
    try {
      const { impact, mitigation } = runEntry(entry, ctx);
      const worst = Object.entries(impact.welfare.byCommodity).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      out.push({ ...entry, cv: impact.welfare.cv, cvAnnual: impact.welfare.cvAnnual, worstCommodity: worst, durationMonths: impact.durationMonths, impact, mitigation });
    } catch (e) {
      console.warn('[SURGE] skipping threat that failed to run', entry.threat.id, e);
    }
  }
  return out.sort((a, b) => b.cv - a.cv);
}

/** Areas in focus (empty for the whole country). */
export function focusAreas(focus: Focus, ctx: EngineContext): AreaInfo[] {
  if (focus.kind === 'us' || !ctx.focus) return [];
  return focus.ids.map((id) => getArea(ctx.focus!, id)).filter((a): a is AreaInfo => !!a);
}
export function focusLabel(focus: Focus, ctx: EngineContext): string {
  const areas = focusAreas(focus, ctx);
  if (areas.length === 0) return 'United States';
  if (areas.length <= 2) return areas.map((a) => a.name).join(' + ');
  return `${areas.length} ${focus.kind === 'state' ? 'states' : 'districts'}`;
}
/** Does the threat reach any area in focus? */
export function reachesFocus(threat: Threat, focus: Focus, ctx: EngineContext): boolean {
  const areas = focusAreas(focus, ctx);
  if (areas.length === 0 || !ctx.focus) return true;
  return areas.some((a) => threatAffectsArea(threat, a, ctx.focus!));
}

/** Numbers for the current focus: national, or the sum over the selected areas. */
export interface FocusView { cv: number; cvAnnual: number; producer: number; affects: boolean; byCommodity: Record<string, number>; producerByCommodity: Record<string, number>; label: string; population: number }
export function focusView(entry: RankedEntry, focus: Focus, ctx: EngineContext): FocusView {
  const nat = entry.impact.welfare;
  const producerNat = Object.values(nat.producerRevenueChange).reduce((a, b) => a + b, 0);
  const areas = focusAreas(focus, ctx);
  if (areas.length === 0) {
    return { cv: nat.cv, cvAnnual: nat.cvAnnual, producer: producerNat, affects: true, byCommodity: nat.byCommodity, producerByCommodity: nat.producerRevenueChange, label: 'United States', population: ctx.population.value };
  }
  const byCommodity: Record<string, number> = {};
  const producerByCommodity: Record<string, number> = {};
  let cv = 0, cvAnnual = 0, producer = 0, population = 0;
  for (const area of areas) {
    const a: AreaLoss = areaLoss(entry.impact, area.id, ctx);
    cv += a.cv; cvAnnual += a.cvAnnual; population += area.population;
    for (const [k, v] of Object.entries(a.byCommodity)) byCommodity[k] = (byCommodity[k] ?? 0) + v;
    for (const [k, v] of Object.entries(a.producerRevenueChange)) { producerByCommodity[k] = (producerByCommodity[k] ?? 0) + v; producer += v; }
  }
  return { cv, cvAnnual, producer, affects: reachesFocus(entry.threat, focus, ctx), byCommodity, producerByCommodity, label: focusLabel(focus, ctx), population };
}

export function commodityName(ctx: EngineContext, id: string): string {
  return ctx.commodities[id]?.name ?? ctx.inputs[id]?.name ?? id;
}

/** A tab as an engine Scenario (for joint runs and comparison). */
export function tabToScenario(tab: TabDef, entries: ThreatEntry[]): Scenario {
  return { id: tab.id, name: tab.name, threats: entries.map((e) => e.threat), createdAt: tab.createdAt || '', updatedAt: tab.updatedAt || '' };
}
