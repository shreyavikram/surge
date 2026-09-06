import type { EngineContext, FocusConfig, CountriesConfig, RegionConfig, CommodityConfig, InputConfig, DemandSystemConfig, ThreatTypeConfig, LeverConfig, PlateConfig, CaseFile, ThreatCategory } from '@surge/engine';
import commodities from '../data/commodities.json' with { type: 'json' };
import inputs from '../data/inputs.json' with { type: 'json' };
import demand from '../data/demand-system.json' with { type: 'json' };
import threatTypes from '../data/threat-types.json' with { type: 'json' };
import regions from '../data/regions.json' with { type: 'json' };
import levers from '../data/levers.json' with { type: 'json' };
import plate from '../data/plate.json' with { type: 'json' };
import focus from '../data/focus.json' with { type: 'json' };
import focusDistricts from '../data/focus-districts.json' with { type: 'json' };
import countries from '../data/countries.json' with { type: 'json' };
import quintiles from '../data/quintile-spending.json' with { type: 'json' };
import stateBboxes from '../data/state-bboxes.json' with { type: 'json' };
import egg2024 from '../data/cases/egg-2024-calibration.json' with { type: 'json' };
import egg2022 from '../data/cases/egg-2022.json' with { type: 'json' };
import formula2022 from '../data/cases/formula-2022.json' with { type: 'json' };

export type CaseId = 'egg-2024-calibration' | 'egg-2022' | 'formula-2022';
export const CASE_IDS: CaseId[] = ['egg-2024-calibration', 'egg-2022', 'formula-2022'];

/** US resident population and CEX totals; Plan 2 refreshes these from FRED (POPTHM, CXUTOTALEXPLB0101M). */
export const POPULATION = { value: 340.1e6, year: 2024, source: 'Census Vintage 2024 (FRED POPTHM)' };
export const CONSUMER_UNITS = { value: 134.6e6, year: 2024, source: 'BLS CEX 2024 number of consumer units (approximate)' };
export const TOTAL_EXPENDITURE = { value: 78535 * 134.6e6, year: 2024, source: 'BLS CEX 2024 CXUTOTALEXPLB0101M $78,535 × consumer units' };

/** County-built shares (NASS 2022 Census) replace the hand-typed state shares where available; districts are appended. */
function mergeFocus(base: FocusConfig, d: { source: string; areas: FocusConfig['areas']; production: FocusConfig['production'] }): FocusConfig {
  const production: FocusConfig['production'] = { ...base.production };
  for (const [cid, shares] of Object.entries(d.production)) {
    const stateShares = Object.fromEntries(Object.entries(shares).filter(([k]) => !k.includes('-')));
    const districtShares = Object.fromEntries(Object.entries(shares).filter(([k]) => k.includes('-')));
    production[cid] = { ...(Object.keys(stateShares).length > 0 ? stateShares : base.production[cid] ?? {}), ...districtShares };
  }
  return { ...base, source: `${base.source}; districts: ${d.source}`, areas: [...base.areas, ...d.areas], production };
}

/** One production region per state (`us-state-XX`) from the county-built shares, so threats can land on a single state. */
function stateRegions(focusCfg: FocusConfig): Record<string, RegionConfig> {
  const out: Record<string, RegionConfig> = {};
  const boxes = (stateBboxes as unknown as { bbox: Record<string, [number, number, number, number]> }).bbox;
  for (const a of focusCfg.areas) {
    if (a.kind !== 'state') continue;
    const share: Record<string, number> = {};
    for (const [cid, byArea] of Object.entries(focusCfg.production)) { const v = byArea[a.id]; if (v && v > 0) share[cid] = v; }
    out[`us-state-${a.id}`] = { id: `us-state-${a.id}`, name: a.name, lat: a.lat, lng: a.lng, bbox: boxes[a.id] ?? [a.lng - 3, a.lat - 2, a.lng + 3, a.lat + 2], usSupplyShare: share, countries: [], source: 'NASS 2022 Census of Agriculture county series summed to the state (see focus-districts.json); bounding box from Census TIGERweb' };
  }
  return out;
}

export function loadContext(): EngineContext {
  const focusCfg = mergeFocus(focus as unknown as FocusConfig, focusDistricts as unknown as { source: string; areas: FocusConfig['areas']; production: FocusConfig['production'] });
  const regionsAll: Record<string, RegionConfig> = { ...(regions as unknown as Record<string, RegionConfig>), ...stateRegions(focusCfg) };
  const regionStates: Record<string, string[]> = { ...focusCfg.regionStates };
  for (const a of focusCfg.areas) if (a.kind === 'state') regionStates[`us-state-${a.id}`] = [a.id];
  return {
    commodities: commodities as unknown as Record<string, CommodityConfig>,
    inputs: inputs as unknown as Record<string, InputConfig>,
    demand: demand as unknown as DemandSystemConfig,
    threatTypes: threatTypes as unknown as Record<ThreatCategory, ThreatTypeConfig>,
    regions: regionsAll,
    levers: levers as unknown as LeverConfig[],
    plate: plate as unknown as PlateConfig,
    population: POPULATION,
    totalExpenditure: TOTAL_EXPENDITURE,
    consumerUnits: CONSUMER_UNITS,
    countries: countries as unknown as CountriesConfig,
    quintileSpending: (quintiles as { byCommodity: Record<string, number[]> }).byCommodity,
    focus: { ...focusCfg, regionStates },
  };
}

export function loadCase(id: CaseId): CaseFile {
  const map: Record<CaseId, unknown> = { 'egg-2024-calibration': egg2024, 'egg-2022': egg2022, 'formula-2022': formula2022 };
  return map[id] as CaseFile;
}
