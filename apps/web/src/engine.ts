// Thin client wrapper over @surge/engine + @surge/config. The engine is
// authoritative; this module only wires config in and re-exports engine calls.
import { loadContext, loadCase, type CaseId } from '@surge/config';
import {
  runThreat,
  rankThreats,
  runScenario,
  compareScenarios,
  combineScenarios,
  findConflicts,
  threatToShocks,
  type EngineContext,
  type Threat,
  type ThreatCategory,
  type ImpactResult,
  type CaseFile,
} from '@surge/engine';
import { SEED_THREATS } from './seed.js';

export {
  runThreat,
  rankThreats,
  runScenario,
  compareScenarios,
  combineScenarios,
  findConflicts,
  threatToShocks,
  loadCase,
};
export type { EngineContext, Threat, ThreatCategory, ImpactResult, CaseFile, CaseId };

let _ctx: EngineContext | null = null;
export function getContext(): EngineContext {
  if (!_ctx) _ctx = loadContext();
  return _ctx;
}

// ---- Category → color family (mirrors theme.css category vars) --------------
export type CategoryFamily = 'geopolitical' | 'natural' | 'biological' | 'supply';

export function categoryFamily(cat: ThreatCategory): CategoryFamily {
  switch (cat) {
    case 'tariff': case 'embargo': case 'export_ban': case 'war':
    case 'instability': case 'chokepoint': case 'import_dependence':
      return 'geopolitical';
    case 'drought': case 'heat': case 'flood': case 'storm': case 'wildfire':
      return 'natural';
    case 'pest': case 'disease':
      return 'biological';
    case 'input_cost': case 'facility':
      return 'supply';
  }
}

export const FAMILY_COLOR: Record<CategoryFamily, string> = {
  geopolitical: '#f5a623',
  natural: '#ff6a5b',
  biological: '#b57bff',
  supply: '#2dd4bf',
};

export function categoryColor(cat: ThreatCategory): string {
  return FAMILY_COLOR[categoryFamily(cat)];
}

export const CATEGORY_LABEL: Record<ThreatCategory, string> = {
  tariff: 'Tariff', embargo: 'Embargo', export_ban: 'Export ban', war: 'War',
  instability: 'Instability', chokepoint: 'Chokepoint', import_dependence: 'Import dependence',
  drought: 'Drought', heat: 'Heat', flood: 'Flood', storm: 'Storm', wildfire: 'Wildfire',
  pest: 'Pest', disease: 'Disease', input_cost: 'Input cost', facility: 'Facility',
};

// ---- Threat list (seeds + calibrated case replays) --------------------------
export type ThreatOrigin = 'seed' | 'replay';
export interface ThreatEntry {
  threat: Threat;
  origin: ThreatOrigin;
  observed?: CaseFile['observed'];
  note?: string;
}

const REPLAY_CASES: CaseId[] = ['egg-2022', 'formula-2022'];

export function buildThreatList(): ThreatEntry[] {
  const entries: ThreatEntry[] = SEED_THREATS.map((threat) => ({ threat, origin: 'seed' as const }));
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

/** Run one entry, honoring a replay's observed price path and any severity override. */
export function runEntry(entry: ThreatEntry, ctx: EngineContext, severityOverride?: number) {
  return runThreat(entry.threat, ctx, severityOverride, entry.observed ? { observed: entry.observed } : undefined);
}

export interface RankedEntry extends ThreatEntry {
  cv: number;
  worstCommodity: string;
  durationMonths: number;
  impact: ImpactResult;
}

/** Watchlist order: every entry run alone (replays at their observed path), ranked by consumer welfare loss. */
export function rankEntries(entries: ThreatEntry[], ctx: EngineContext): RankedEntry[] {
  return entries
    .map((entry) => {
      const { impact } = runEntry(entry, ctx);
      const worst = Object.entries(impact.welfare.byCommodity).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      return { ...entry, cv: impact.welfare.cv, worstCommodity: worst, durationMonths: impact.durationMonths, impact };
    })
    .sort((a, b) => b.cv - a.cv);
}

export function commodityName(ctx: EngineContext, id: string): string {
  return ctx.commodities[id]?.name ?? ctx.inputs[id]?.name ?? id;
}
