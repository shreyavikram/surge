// packages/engine/src/focus.ts
// Where the loss lands: US, a state, or a congressional district. Consumption shares scale the
// consumer loss; production shares attribute producer revenue; region→state coverage decides
// whether a domestic threat touches an area at all. Methodology §7.
import type { EngineContext, FocusConfig, AreaInfo, ImpactResult, Threat } from './types.js';

export interface FocusSelection { kind: 'us' | 'state' | 'district'; id?: string }

/** Regional food-at-home spending relative to the mean, adjusted by income with a small elasticity. */
export function spendIndex(a: AreaInfo, cfg: FocusConfig): number {
  const regional = Object.values(cfg.foodSpendPerCU);
  const mean = regional.reduce((x, y) => x + y, 0) / regional.length;
  return (cfg.foodSpendPerCU[a.region] / mean) * Math.pow(a.medianIncome / cfg.usMedianIncome, cfg.incomeElasticityFood);
}

/** Share of national food consumption in each area of a kind (population × spend index, normalized). */
export function consumptionShares(cfg: FocusConfig, kind: 'state' | 'district'): Record<string, number> {
  const areas = cfg.areas.filter((a) => a.kind === kind);
  const w = areas.map((a) => a.population * spendIndex(a, cfg));
  const tot = w.reduce((x, y) => x + y, 0);
  return Object.fromEntries(areas.map((a, i) => [a.id, tot > 0 ? w[i]! / tot : 0]));
}

export function productionShare(cfg: FocusConfig, commodity: string, areaId: string): number {
  return cfg.production[commodity]?.[areaId] ?? 0;
}

export function getArea(cfg: FocusConfig, id: string): AreaInfo | undefined {
  return cfg.areas.find((a) => a.id === id);
}

/** States a production region covers; an empty list means the whole country. */
export function regionStates(cfg: FocusConfig, regionId: string | undefined): string[] | undefined {
  if (!regionId) return undefined;
  return cfg.regionStates[regionId];
}

/** Foreign and import threats reach every area; a domestic threat reaches the states its region covers. */
export function threatAffectsArea(threat: Threat, area: AreaInfo, cfg: FocusConfig): boolean {
  const states = regionStates(cfg, threat.location.regionId);
  if (states === undefined || states.length === 0) return true;
  return states.includes(area.state);
}

function areasInRegion(cfg: FocusConfig, regionId: string, kind: 'state' | 'district'): AreaInfo[] {
  const states = cfg.regionStates[regionId];
  return cfg.areas.filter((a) => a.kind === kind && (states === undefined || states.length === 0 || states.includes(a.state)));
}

export interface AreaLoss {
  areaId: string;
  cv: number;
  cvAnnual: number;
  perCapita: number;
  byCommodity: Record<string, number>;
  producerRevenueChange: Record<string, number>;
  producerRevenueChangeAnnual: Record<string, number>;
  consumptionShare: number;
}

/**
 * Attribute a national impact to one area.
 * Consumers: national CV × the area's consumption share.
 * Producers: the area's producers earn the higher wholesale price on their baseline output and lose
 * their share of the region's lost output (lost units land on the producers inside the shocked region,
 * in proportion to production share).
 */
export function areaLoss(impact: ImpactResult, areaId: string, ctx: EngineContext): AreaLoss {
  const cfg = ctx.focus;
  const area = cfg ? getArea(cfg, areaId) : undefined;
  if (!cfg || !area) throw new Error(`unknown focus area ${areaId}`);
  const cs = consumptionShares(cfg, area.kind)[areaId] ?? 0;
  const byCommodity: Record<string, number> = {};
  for (const [id, v] of Object.entries(impact.welfare.byCommodity)) byCommodity[id] = v * cs;
  const producerRevenueChange: Record<string, number> = {};
  const producerRevenueChangeAnnual: Record<string, number> = {};
  for (const id of impact.commodities) {
    const c = ctx.commodities[id];
    if (!c) continue;
    const pa = productionShare(cfg, id, areaId);
    if (pa === 0) { producerRevenueChange[id] = 0; producerRevenueChangeAnnual[id] = 0; continue; }
    const domShare = Math.max(1e-9, 1 - c.trade.importShare);
    const monthlyQ = c.baseline.annualQuantity / 12;
    const Xdom = (monthlyQ * c.baseline.retailPrice) * domShare;
    const pw = impact.price.wholesalePct[id] ?? [];
    let total = 0, annual = 0;
    for (let t = 0; t < pw.length; t++) {
      // this area's own lost fraction of its output this month
      let lostFrac = 0;
      for (const [regionId, units] of Object.entries(impact.domesticLossByRegion[id] ?? {})) {
        const members = areasInRegion(cfg, regionId, area.kind);
        if (!members.some((m) => m.id === areaId)) continue;
        const pR = members.reduce((s, m) => s + productionShare(cfg, id, m.id), 0);
        if (pR <= 0) continue;
        const regionFrac = ((units[t] ?? 0) / monthlyQ) / domShare; // fraction of domestic output lost in this region
        lostFrac += regionFrac / pR;
      }
      lostFrac = Math.min(1, lostFrac);
      const d = pa * Xdom * ((1 + (pw[t] ?? 0)) * (1 - lostFrac) - 1);
      total += d;
      if (t < 12) annual += d;
    }
    producerRevenueChange[id] = total;
    producerRevenueChangeAnnual[id] = annual;
  }
  const cv = impact.welfare.cv * cs;
  return { areaId, cv, cvAnnual: impact.welfare.cvAnnual * cs, perCapita: area.population > 0 ? cv / area.population : 0, byCommodity, producerRevenueChange, producerRevenueChangeAnnual, consumptionShare: cs };
}

/** Producer revenue change for every area of a kind (the Distribution map, producers view). */
export function producerChangeByArea(impact: ImpactResult, ctx: EngineContext, kind: 'state' | 'district'): { areaId: string; total: number; annual: number }[] {
  const cfg = ctx.focus;
  if (!cfg) return [];
  return cfg.areas.filter((a) => a.kind === kind).map((a) => {
    const r = areaLoss(impact, a.id, ctx);
    return { areaId: a.id, total: Object.values(r.producerRevenueChange).reduce((x, y) => x + y, 0), annual: Object.values(r.producerRevenueChangeAnnual).reduce((x, y) => x + y, 0) };
  });
}

/** Per-capita consumer loss for every area of a kind (the Distribution map). */
export function perCapitaLossByArea(impact: ImpactResult, ctx: EngineContext, kind: 'state' | 'district', horizon: 'annual' | 'total' = 'total'): { areaId: string; perCapita: number; cv: number }[] {
  const cfg = ctx.focus;
  if (!cfg) return [];
  const shares = consumptionShares(cfg, kind);
  const base = horizon === 'annual' ? impact.welfare.cvAnnual : impact.welfare.cv;
  return cfg.areas.filter((a) => a.kind === kind).map((a) => {
    const cv = base * (shares[a.id] ?? 0);
    return { areaId: a.id, cv, perCapita: a.population > 0 ? cv / a.population : 0 };
  });
}
