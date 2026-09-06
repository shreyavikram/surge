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
import originShares from '../data/origin-shares.json' with { type: 'json' };
import countryGeo from '../data/country-geo.json' with { type: 'json' };
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

interface OriginSharesFile { source: string; window: { from: string; to: string }; byCommodity: Record<string, { totalUsd: number; origins: Record<string, { name: string; valueUsd: number; share: number }> }> }
interface CountryGeoFile { source: string; countries: Record<string, { name: string; lat: number; lng: number; bbox: [number, number, number, number] }> }

const ORIGIN_MIN_SHARE = 0.005;      // below this an origin is noise for the commodity
const NEW_REGION_MIN_SHARE = 0.02;   // a country with no hand-written region is added once it supplies 2% of some commodity's imports

/**
 * Measured import-origin shares (US Census Bureau monthly imports by country, last twelve reported months)
 * replace the hand-typed `usImportOriginShare` of every single-country region, and every other country that
 * supplies at least NEW_REGION_MIN_SHARE of some commodity's imports becomes a region of its own, so a
 * threat can be placed on it. Multi-country regions (chokepoints) are untouched.
 */
function applyMeasuredOrigins(base: Record<string, RegionConfig>, shares: OriginSharesFile, geo: CountryGeoFile): Record<string, RegionConfig> {
  const byIso: Record<string, Record<string, number>> = {};
  const nameOf: Record<string, string> = {};
  for (const [commodity, v] of Object.entries(shares.byCommodity)) {
    for (const [iso, o] of Object.entries(v.origins)) {
      if (o.share < ORIGIN_MIN_SHARE) continue;
      (byIso[iso] ??= {})[commodity] = Math.round(o.share * 1000) / 1000;
      nameOf[iso] = o.name;
    }
  }
  const out: Record<string, RegionConfig> = {};
  const covered = new Set<string>();
  const note = `${shares.source}, ${shares.window.from} to ${shares.window.to} (measured; value shares)`;
  for (const [id, r] of Object.entries(base)) {
    const iso = r.countries?.length === 1 ? r.countries[0]! : undefined;
    if (iso && byIso[iso]) {
      covered.add(iso);
      out[id] = { ...r, usImportOriginShare: byIso[iso], source: `${note}; other shares: ${r.source}` };
    } else out[id] = r;
  }
  const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  for (const [iso, commodityShares] of Object.entries(byIso)) {
    if (covered.has(iso)) continue;
    if (!Object.values(commodityShares).some((x) => x >= NEW_REGION_MIN_SHARE)) continue;
    const g = geo.countries[iso];
    if (!g) continue;
    let id = slug(nameOf[iso] ?? iso);
    if (out[id]) id = `${id}-${iso.toLowerCase()}`;
    out[id] = { id, name: g.name, lat: g.lat, lng: g.lng, bbox: g.bbox, usImportOriginShare: commodityShares, countries: [iso], source: `${note}; geometry: ${geo.source}` };
  }
  return out;
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
  const regionsAll: Record<string, RegionConfig> = { ...applyMeasuredOrigins(regions as unknown as Record<string, RegionConfig>, originShares as unknown as OriginSharesFile, countryGeo as unknown as CountryGeoFile), ...stateRegions(focusCfg) };
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
