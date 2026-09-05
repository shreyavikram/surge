// packages/engine/src/types.ts
export type SourceKind = 'live' | 'archive' | 'computed' | 'structural' | 'user';

export interface SourceStamp {
  feed: string;
  url?: string;
  fetchedAt?: string;
  kind: SourceKind;
  stale?: boolean;
  note?: string;
}

export interface Assumption {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  source: string;
  kind: 'measured' | 'modeled';
}

export type ThreatCategory =
  | 'tariff' | 'embargo' | 'export_ban' | 'war' | 'instability' | 'chokepoint' | 'import_dependence'
  | 'drought' | 'heat' | 'flood' | 'storm' | 'wildfire' | 'pest' | 'disease'
  | 'input_cost' | 'facility';

export type PhysicalKind =
  | 'animals_affected'          // head
  | 'yield_loss_fraction'       // 0..1 of affected area's yield
  | 'transit_decline_fraction'  // 0..1 of chokepoint transit
  | 'import_share_blocked'      // 0..1 of US imports from origin blocked
  | 'tariff_rate'               // ad valorem, 0.25 = 25%
  | 'capacity_out_fraction'     // 0..1 of national capacity offline
  | 'input_price_increase';     // fractional increase in an input price

export interface PhysicalShock {
  kind: PhysicalKind;
  value: number;
  /** Optional monthly timeline overriding a single value: month index from threat start → value. */
  timeline?: { month: number; value: number }[];
}

export interface Threat {
  id: string;
  name: string;
  category: ThreatCategory;
  kind: 'geopolitical' | 'natural';
  location: { lat: number; lng: number; admin?: string; iso3?: string; regionId?: string };
  commodities: { id: string; relevance: number }[];
  severity: number;               // 0..1
  physical?: PhysicalShock;
  start: string;                  // YYYY-MM
  months?: number;                // duration override
  source: SourceStamp;
  gated?: Record<string, unknown>;
}

export interface Shock {
  kind: 'supply' | 'cost';
  commodity: string;              // retail commodity id that consumers face
  via?: string;                   // input id when kind === 'cost'
  region: string;
  start: string;                  // YYYY-MM
  supplyPath: number[];           // fraction of baseline supply lost, per month, >= 0
  costPath?: number[];            // fractional wholesale price wedge from cost shocks, per month
  passThrough: number;
  lagMonths: number;
  provenance: SourceStamp[];
  label?: string;
}

export interface CommodityConfig {
  id: string;
  name: string;
  group: string;                  // demand-system item id this commodity maps to
  unit: string;
  baseline: {
    annualQuantity: number;       // in `unit`, US consumption
    retailPrice: number;          // USD per unit
    year: number;
    source: string;
  };
  demand: {
    ownPrice: number;             // Marshallian, retail
    range: [number, number];      // e.g. [-0.11, -0.27]
    expenditure: number;
    source: string;
  };
  trade: {
    exportShare: number;          // exports / production
    exportElasticity: number;     // export demand, <= 0
    importShare: number;          // imports / consumption
    source: string;
  };
  supply: {
    model: 'livestock' | 'crop' | 'manufacturing' | 'import';
    nationalInventory?: number;   // head, livestock
    recoveryLagMinMonths?: number;
    recoveryLagMaxMonths?: number;
    producerOffset?: number;      // fraction of naive loss offset by producer adjustments
    harvestMonth?: number;        // 1..12, crop (0 = continuous)
    stocksToUse?: number;         // crop
    source: string;
  };
  transmission: { passThrough: number; lagMonths: number; source: string };
  fredSeries?: string;
  inputs?: { input: string; costShare: number; source: string }[];
  plate: string[];
}

/** Farm-level or upstream inputs whose price shocks reach retail commodities through cost shares. */
export interface InputConfig {
  id: string;
  name: string;
  unit: string;
  demand: { totalElasticity: number; source: string };     // domestic use + export demand, farm/wholesale level
  trade: { exportShare: number; exportElasticity: number; importShare: number; source: string };
  supply: { model: 'crop' | 'manufacturing' | 'import'; harvestMonth?: number; stocksToUse?: number; source: string };
}

export interface DemandItem {
  id: string;
  label: string;
  budgetShare: number;            // share of total expenditure
  expenditureElasticity: number;
  expenditureSE?: number;
  group?: string;
  note?: string;
}

export interface DemandSystemConfig {
  source: string;
  items: DemandItem[];
  /** marshallian[i][j] = elasticity of demand for item i w.r.t. price of item j */
  marshallian: number[][];
  standardErrors?: number[][];
}

export interface ThreatTypeConfig {
  category: ThreatCategory;
  kind: 'geopolitical' | 'natural';
  rule: 'livestock_disease' | 'crop_hazard' | 'livestock_hazard' | 'trade_block' | 'tariff' | 'world_price'
      | 'chokepoint' | 'input_cost' | 'facility' | 'vulnerability_only';
  /** yield or capacity loss fraction at severity 1 (hazards) */
  damageAtSeverity1?: number;
  defaultMonths: number;
  source: string;
}

export interface RegionConfig {
  id: string;
  name: string;
  lat: number; lng: number;
  bbox: [number, number, number, number]; // west, south, east, north
  usSupplyShare?: Record<string, number>;
  usImportOriginShare?: Record<string, number>;
  worldExportShare?: Record<string, number>;
  chokepointImportShare?: Record<string, number>;
  source: string;
}

export interface LeverConfig {
  id: string;
  name: string;
  commodity: string;
  type: 'regulatory' | 'import' | 'stockpile' | 'domestic_ramp' | 'redirect' | 'demand_side';
  capacityPerMonth: number;       // units per month at full ramp (0 for pure regulatory unlocks)
  leadMonths: number;
  rampMonths: number;
  unitCost: number;               // USD per unit delivered
  fixedCost: number;
  stock?: number;                 // stockpile total units, or cap on units a regulatory lever can enable
  rationingShare?: number;        // demand_side: fraction of gap removed by rationing
  requires?: string;              // lever id that must be active first
  activeMonths?: number;          // months the lever stays available after its lead (dependents inherit the requirement's window)
  enabledByDefault: boolean;
  precedent: { name: string; url: string; note: string };
  source: string;
}

export interface PlateNode { id: string; label: string; stage: 'input' | 'farm' | 'processing' | 'plate'; commodity?: string }
export interface PlateConfig { nodes: PlateNode[]; edges: { from: string; to: string }[]; source: string }

export interface AssumptionOverrides {
  elasticity?: Record<string, number>;        // commodity id → own-price elasticity
  recoveryLagShiftMonths?: number;            // added to min and max lag
  passThrough?: Record<string, number>;
  attributionShare?: number;                  // observed-path replays
  pricePath?: 'modeled' | 'observed';
}

export interface EngineContext {
  commodities: Record<string, CommodityConfig>;
  inputs: Record<string, InputConfig>;
  demand: DemandSystemConfig;
  threatTypes: Record<ThreatCategory, ThreatTypeConfig>;
  regions: Record<string, RegionConfig>;
  levers: LeverConfig[];
  plate: PlateConfig;
  population: { value: number; year: number; source: string };
  /** annual total consumer expenditure, USD, all households */
  totalExpenditure: { value: number; year: number; source: string };
  /** number of consumer units (households) behind totalExpenditure */
  consumerUnits?: { value: number; year: number; source: string };
  /** per-commodity, per-income-quintile annual spending per household, USD (optional) */
  quintileSpending?: Record<string, number[]>;
  overrides?: AssumptionOverrides;
}

export interface ImpactResult {
  months: string[];
  commodities: string[];
  price: { wholesalePct: Record<string, number[]>; retailPct: Record<string, number[]>; path: 'modeled' | 'observed' };
  quantity: { pct: Record<string, number[]> };
  shortfall: Record<string, { units: number[]; unit: string }>;
  welfare: {
    cv: number;
    ev: number;
    csReplica: number;
    band: { low: number; high: number; over: 'elasticity' };
    byCommodity: Record<string, number>;
    substitution: { commodity: string; quantityPct: number; significant: boolean }[];
    incidence: { quintile: number; lossPerHousehold: number }[];
    producerRevenueChange: Record<string, number>;
  };
  durationMonths: number;
  assumptions: Assumption[];
  checks: { slutskySymmetryAdjustment: number; negativeSemidefinite: boolean };
}

export interface LeverResult {
  id: string; name: string; type: LeverConfig['type'];
  unitsPath: number[];
  cumulative: number;
  share: number;                  // of cumulative gap: how much of the problem the lever solved
  reliefShare: number;            // of all relief delivered (supply + rationing): how much of the response it was
  enabledUnits: number;           // regulatory unlocks: units delivered by levers that required it
  cost: number;
  leadMonths: number;
  precedent: LeverConfig['precedent'];
  classification: 'does the work' | 'contributes' | 'marginal' | 'unused';
}

export interface MitigationPlan {
  commodity: string;
  unit: string;
  gap: number[];
  covered: number[];
  coverage: number[];
  rationed: number[];
  levers: LeverResult[];
  totalCost: number;
  timeToCloseMonths: number | null;
  cumulativeGap: number;
  uncoveredShare: number;
}

export interface ScenarioThreat extends Threat { severityOverride?: number }
export interface Scenario {
  id: string;
  name: string;
  threats: ScenarioThreat[];
  overrides?: AssumptionOverrides;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioResult {
  scenario: Scenario;
  shocks: Shock[];
  impact: ImpactResult;
  mitigation: Record<string, MitigationPlan>;
}

export interface Conflict {
  commodity: string;
  region: string;
  a: ScenarioThreat;
  b: ScenarioThreat;
}

export interface CompareRow {
  scenarioId: string;
  name: string;
  totalCV: number;
  byCommodity: Record<string, number>;
  worstCommodity: string;
  mitigationCost: number;
  timeToRecoverMonths: number | null;
  incidence: { quintile: number; lossPerHousehold: number }[];
}

export interface CaseFile {
  id: string;
  name: string;
  description: string;
  threats: Threat[];
  observed?: { commodity: string; months: string[]; retailPrice: number[]; counterfactualPrice: number[]; attributionShare: number; source: string };
  expected?: Record<string, number>;
  source: string;
}
