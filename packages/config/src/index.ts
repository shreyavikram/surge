import type { EngineContext, CommodityConfig, InputConfig, DemandSystemConfig, ThreatTypeConfig, RegionConfig, LeverConfig, PlateConfig, CaseFile, ThreatCategory } from '@surge/engine';
import commodities from '../data/commodities.json' with { type: 'json' };
import inputs from '../data/inputs.json' with { type: 'json' };
import demand from '../data/demand-system.json' with { type: 'json' };
import threatTypes from '../data/threat-types.json' with { type: 'json' };
import regions from '../data/regions.json' with { type: 'json' };
import levers from '../data/levers.json' with { type: 'json' };
import plate from '../data/plate.json' with { type: 'json' };
import egg2024 from '../data/cases/egg-2024-calibration.json' with { type: 'json' };
import egg2022 from '../data/cases/egg-2022.json' with { type: 'json' };
import formula2022 from '../data/cases/formula-2022.json' with { type: 'json' };

export type CaseId = 'egg-2024-calibration' | 'egg-2022' | 'formula-2022';
export const CASE_IDS: CaseId[] = ['egg-2024-calibration', 'egg-2022', 'formula-2022'];

/** US resident population and CEX totals; Plan 2 refreshes these from FRED (POPTHM, CXUTOTALEXPLB0101M). */
export const POPULATION = { value: 340.1e6, year: 2024, source: 'Census Vintage 2024 (FRED POPTHM)' };
export const CONSUMER_UNITS = { value: 134.6e6, year: 2024, source: 'BLS CEX 2024 number of consumer units (approximate)' };
export const TOTAL_EXPENDITURE = { value: 78535 * 134.6e6, year: 2024, source: 'BLS CEX 2024 CXUTOTALEXPLB0101M $78,535 × consumer units' };

export function loadContext(): EngineContext {
  return {
    commodities: commodities as unknown as Record<string, CommodityConfig>,
    inputs: inputs as unknown as Record<string, InputConfig>,
    demand: demand as unknown as DemandSystemConfig,
    threatTypes: threatTypes as unknown as Record<ThreatCategory, ThreatTypeConfig>,
    regions: regions as unknown as Record<string, RegionConfig>,
    levers: levers as unknown as LeverConfig[],
    plate: plate as unknown as PlateConfig,
    population: POPULATION,
    totalExpenditure: TOTAL_EXPENDITURE,
    consumerUnits: CONSUMER_UNITS,
  };
}

export function loadCase(id: CaseId): CaseFile {
  const map: Record<CaseId, unknown> = { 'egg-2024-calibration': egg2024, 'egg-2022': egg2022, 'formula-2022': formula2022 };
  return map[id] as CaseFile;
}
