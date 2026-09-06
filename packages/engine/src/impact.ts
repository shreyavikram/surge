// packages/engine/src/impact.ts
import type { EngineContext, Shock, ImpactResult, Assumption, CaseFile, CommodityConfig } from './types.js';
import { buildDemandSystem, toHicksian, symmetrize, slutskyMatrix, checkNSD } from './demand-system.js';
import { pricePaths, observedRetailPath } from './price.js';
import { cvSecondOrder, evApprox, csConstantElasticity, substitutionPct, incidenceByQuintile } from './welfare.js';
import { monthRange, monthIndex } from './months.js';
import { SHOCK_CONSTANTS } from './shock.js';

/** The demand-system preparation (Slutsky symmetrization and the eigenvalue check) is the costly part of a run and
 * depends only on the configuration, so it is computed once per demand config. */
const prepared = new WeakMap<object, { ds: ReturnType<typeof buildDemandSystem>; sym: ReturnType<typeof symmetrize>; nsd: ReturnType<typeof checkNSD>; numeraire: Set<number> }>();
function prepareDemand(demand: EngineContext['demand']) {
  const hit = prepared.get(demand);
  if (hit) return hit;
  const ds = buildDemandSystem(demand);
  const numeraire = new Set<number>();
  if (ds.index['nonfood'] !== undefined) numeraire.add(ds.index['nonfood']);
  const sym = symmetrize(toHicksian(ds), ds.w, ds.se, numeraire);
  const nsd = checkNSD(slutskyMatrix(sym.epsC, ds.w));
  const out = { ds, sym, nsd, numeraire };
  prepared.set(demand, out);
  return out;
}

interface Merged { supply: number[]; cost: number[]; domestic: number[]; imports: number[]; byRegion: Record<string, number[]>; n: number }

/** Sum shocks per commodity onto a common monthly axis starting at the earliest shock month. */
function mergeShocks(shocks: Shock[], start: string): Map<string, Merged> {
  const byC = new Map<string, Merged>();
  for (const s of shocks) {
    const off = monthIndex(start, s.start);
    const n = off + s.supplyPath.length;
    const cur = byC.get(s.commodity) ?? { supply: [], cost: [], domestic: [], imports: [], byRegion: {}, n: 0 };
    while (cur.supply.length < n) { cur.supply.push(0); cur.cost.push(0); cur.domestic.push(0); cur.imports.push(0); }
    cur.n = Math.max(cur.n, n);
    const dom = s.kind === 'supply' && (s.origin ?? 'domestic') === 'domestic';
    const reg = (cur.byRegion[s.region] ??= []);
    while (reg.length < n) reg.push(0);
    s.supplyPath.forEach((v, t) => {
      cur.supply[off + t]! += v;
      if (dom) { cur.domestic[off + t]! += v; reg[off + t]! += v; } else cur.imports[off + t]! += v;
    });
    (s.costPath ?? []).forEach((v, t) => { cur.cost[off + t]! += v; });
    byC.set(s.commodity, cur);
  }
  return byC;
}

function pad(a: number[], n: number): number[] { return [...a, ...new Array<number>(Math.max(0, n - a.length)).fill(0)]; }

export function computeImpact(shocks: Shock[], ctx: EngineContext, opts?: { observed?: CaseFile['observed'] }): ImpactResult {
  const assumptions: Assumption[] = [];
  const start = shocks.map((s) => s.start).sort()[0] ?? '2024-01';
  const merged = mergeShocks(shocks, start);
  const commodities = [...merged.keys()].sort();
  const N = Math.max(0, ...[...merged.values()].map((m) => m.n));
  const months = monthRange(start, N);
  const usePath: 'modeled' | 'observed' = ctx.overrides?.pricePath === 'observed' && opts?.observed ? 'observed' : 'modeled';
  const households = ctx.consumerUnits?.value ?? 134.6e6;

  const { ds, sym, nsd, numeraire } = prepareDemand(ctx.demand);
  const eps = ds.eps.map((r) => r.slice());
  const epsC = sym.epsC.map((r) => r.slice());

  // baseline monthly expenditure per demand item: commodity baselines where mapped, else CEX share × total
  const commoditiesByItem = new Map<string, CommodityConfig[]>();
  for (const c of Object.values(ctx.commodities)) commoditiesByItem.set(c.group, [...(commoditiesByItem.get(c.group) ?? []), c]);
  // baseline price: a replay values the shock at its own counterfactual price, not the config year's
  const priceOf = (c: CommodityConfig): number => {
    const o = opts?.observed;
    if (usePath === 'observed' && o && o.commodity === c.id && o.counterfactualPrice.length > 0) {
      return o.counterfactualPrice.reduce((a, b) => a + b, 0) / o.counterfactualPrice.length;
    }
    return c.baseline.retailPrice;
  };
  const Xc = (c: CommodityConfig): number => (c.baseline.annualQuantity * priceOf(c)) / 12;
  const Xitem: number[] = ds.ids.map((id) => {
    const cs = commoditiesByItem.get(id);
    return cs && cs.length > 0 ? cs.reduce((a, c) => a + Xc(c), 0) : (ds.w[ds.index[id]!]! * ctx.totalExpenditure.value) / 12;
  });

  const wholesalePct: Record<string, number[]> = {};
  const retailPct: Record<string, number[]> = {};
  const quantityPct: Record<string, number[]> = {};
  const shortfall: ImpactResult['shortfall'] = {};
  const domesticLossByRegion: ImpactResult['domesticLossByRegion'] = {};
  const producerRevenueChange: Record<string, number> = {};
  const epsOwnOf: Record<string, number> = {};

  for (const id of commodities) {
    const c = ctx.commodities[id]!;
    const m = merged.get(id)!;
    const epsOwn = ctx.overrides?.elasticity?.[id] ?? c.demand.ownPrice;
    epsOwnOf[id] = epsOwn;
    const theta = ctx.overrides?.passThrough?.[id] ?? c.transmission.passThrough;
    const supply = pad(m.supply, N), cost = pad(m.cost, N);
    const p = pricePaths(supply, cost, { eps: epsOwn, exportShare: c.trade.exportShare, exportElasticity: c.trade.exportElasticity, passThrough: theta, lagMonths: c.transmission.lagMonths });
    let retail = p.retailPct;
    if (usePath === 'observed' && opts?.observed && opts.observed.commodity === id) {
      const attr = ctx.overrides?.attributionShare ?? opts.observed.attributionShare;
      const obs = observedRetailPath(opts.observed.retailPrice, opts.observed.counterfactualPrice, attr);
      retail = months.map((ym) => { const k = opts.observed!.months.indexOf(ym); return k >= 0 ? obs[k]! : 0; });
      assumptions.push({ key: `attribution.${id}`, label: 'Share of observed price deviation attributed to this threat', value: attr, source: opts.observed.source, kind: 'modeled' });
    }
    wholesalePct[id] = p.wholesalePct;
    retailPct[id] = retail;
    quantityPct[id] = retail.map((r) => epsOwn * r);
    const monthlyQ = c.baseline.annualQuantity / 12;
    const domestic = pad(m.domestic, N), imports = pad(m.imports, N);
    shortfall[id] = { units: supply.map((s) => s * monthlyQ), unit: c.unit, domesticUnits: domestic.map((s) => s * monthlyQ), importUnits: imports.map((s) => s * monthlyQ) };
    domesticLossByRegion[id] = Object.fromEntries(Object.entries(m.byRegion).map(([r, path]) => [r, pad(path, N).map((s) => s * monthlyQ)]));
    // US producers of this commodity: revenue on domestic supply at the wholesale price; only domestic losses reduce their quantity
    const domShare = Math.max(1e-9, 1 - c.trade.importShare);
    const Xdom = Xc(c) * domShare;
    producerRevenueChange[id] = p.wholesalePct.reduce((acc, pw, t) => acc + Xdom * ((1 + pw) * (1 - (domestic[t] ?? 0) / domShare) - 1), 0);
    assumptions.push(
      { key: `elasticity.${id}`, label: `Own-price elasticity, ${c.name}`, value: epsOwn, source: c.demand.source, kind: 'modeled' },
      { key: `passThrough.${id}`, label: `Retail pass-through, ${c.name}`, value: theta, source: c.transmission.source, kind: 'modeled' },
      { key: `baseline.${id}`, label: `Baseline consumption, ${c.name}`, value: c.baseline.annualQuantity, unit: `${c.unit}/yr`, source: c.baseline.source, kind: 'measured' },
      { key: `price.${id}`, label: `Baseline retail price, ${c.name}`, value: priceOf(c), unit: `USD/${c.unit}`, source: priceOf(c) === c.baseline.retailPrice ? c.baseline.source : `${opts?.observed?.source ?? ''} (counterfactual mean)`, kind: 'measured' },
      { key: `trade.${id}`, label: `Export share / export elasticity, ${c.name}`, value: `${c.trade.exportShare} / ${c.trade.exportElasticity}`, source: c.trade.source, kind: 'modeled' },
    );
    if (c.supply.model === 'livestock') {
      const shift = ctx.overrides?.recoveryLagShiftMonths ?? 0;
      assumptions.push(
        { key: `recovery.${id}`, label: `Recovery lag (months), ${c.name}`, value: `${c.supply.recoveryLagMinMonths! + shift}–${c.supply.recoveryLagMaxMonths! + shift}`, source: c.supply.source, kind: 'modeled' },
        { key: `offset.${id}`, label: `Producer offset, ${c.name}`, value: c.supply.producerOffset ?? 0, source: c.supply.source, kind: 'modeled' },
      );
    }
  }
  assumptions.push(
    { key: 'pricePath', label: 'Price path', value: usePath, source: usePath === 'observed' ? 'FRED retail series vs counterfactual' : 'Structural clearing (methodology §2)', kind: 'modeled' },
    { key: 'demandSystem', label: 'Demand system', value: 'ERR-139 unconditional, precision-weighted Slutsky symmetrization, nonfood numeraire', source: ctx.demand.source, kind: 'modeled' },
    { key: 'cropSeason', label: 'Crop losses begin at shock start and run one marketing year', value: 'simplification', source: 'DECISIONS.md', kind: 'modeled' },
    { key: 'shockConstants', label: 'Rerouting / world-price transmission / freight wedge', value: `${SHOCK_CONSTANTS.REROUTING_SHARE} / ${SHOCK_CONSTANTS.WORLD_PRICE_TRANSMISSION} / ${SHOCK_CONSTANTS.FREIGHT_WEDGE_AT_FULL_CLOSURE}`, source: 'DECISIONS.md', kind: 'modeled' },
  );

  // item-level π per month: expenditure-weighted across commodities sharing an item; item diagonal from weighted own elasticities
  const itemOf = (id: string) => ds.index[ctx.commodities[id]!.group]!;
  const itemsMoved = new Map<number, string[]>();
  for (const id of commodities) itemsMoved.set(itemOf(id), [...(itemsMoved.get(itemOf(id)) ?? []), id]);
  for (const [k, ids] of itemsMoved) {
    const Xk = ids.reduce((a, id) => a + Xc(ctx.commodities[id]!), 0);
    const e = ids.reduce((a, id) => a + Xc(ctx.commodities[id]!) * epsOwnOf[id]!, 0) / Xk;
    eps[k]![k] = e;
    epsC[k]![k] = e + ds.w[k]! * ds.eta[k]!;
  }
  const piByMonth: number[][] = Array.from({ length: N }, () => new Array<number>(ds.ids.length).fill(0));
  const shareInItem: Record<string, number[]> = {}; // commodity's share of its item's X·π per month
  for (const [k, ids] of itemsMoved) {
    for (let t = 0; t < N; t++) {
      const parts = ids.map((id) => Xc(ctx.commodities[id]!) * retailPct[id]![t]!);
      const tot = parts.reduce((a, b) => a + b, 0);
      piByMonth[t]![k] = tot / Xitem[k]!;
      ids.forEach((id, i) => { (shareInItem[id] ??= new Array<number>(N).fill(0))[t] = tot !== 0 ? parts[i]! / tot : 0; });
    }
  }

  // welfare, summed monthly
  const M = ctx.totalExpenditure.value / 12;
  let cv = 0, ev = 0;
  const cvByMonth: number[] = new Array(N).fill(0);
  const byCommodity: Record<string, number> = Object.fromEntries(commodities.map((id) => [id, 0]));
  for (let t = 0; t < N; t++) {
    const pi = piByMonth[t]!;
    const r = cvSecondOrder(Xitem, epsC, pi);
    cv += r.cv;
    cvByMonth[t] = r.cv;
    ev += evApprox(r.cv, Xitem, ds.eta, pi, M);
    for (const [k, ids] of itemsMoved) {
      if (pi[k] === 0) continue;
      let item = Xitem[k]! * pi[k]!;
      for (let j = 0; j < ds.ids.length; j++) item += 0.5 * Xitem[k]! * epsC[k]![j]! * pi[k]! * (pi[j] ?? 0);
      for (const id of ids) byCommodity[id]! += item * shareInItem[id]![t]!;
    }
  }

  // single-good replica: exact constant-elasticity CS per commodity per month
  let csReplica = 0;
  for (const id of commodities) {
    const c = ctx.commodities[id]!;
    for (const r of retailPct[id]!) csReplica += r > 0 ? csConstantElasticity(Xc(c), r, epsOwnOf[id]!) : 0;
  }

  // band over each commodity's elasticity range (modeled path: prices re-solved; observed path: only the second-order term moves)
  const bandFor = (pick: (c: CommodityConfig) => number): number => {
    let total = 0;
    const epsB = epsC.map((r) => r.slice());
    for (const [k, ids] of itemsMoved) {
      const Xk = ids.reduce((a, id) => a + Xc(ctx.commodities[id]!), 0);
      const e = ids.reduce((a, id) => a + Xc(ctx.commodities[id]!) * pick(ctx.commodities[id]!), 0) / Xk;
      epsB[k]![k] = e + ds.w[k]! * ds.eta[k]!;
    }
    for (let t = 0; t < N; t++) {
      const pi = new Array<number>(ds.ids.length).fill(0);
      for (const [k, ids] of itemsMoved) {
        let tot = 0;
        for (const id of ids) {
          const c = ctx.commodities[id]!;
          let r = retailPct[id]![t]!;
          if (usePath !== 'observed' || opts?.observed?.commodity !== id) {
            const m = merged.get(id)!;
            const theta = ctx.overrides?.passThrough?.[id] ?? c.transmission.passThrough;
            const src = t - c.transmission.lagMonths;
            const s = src >= 0 ? (m.supply[src] ?? 0) : 0, co = src >= 0 ? (m.cost[src] ?? 0) : 0;
            r = pricePaths([s], [co], { eps: pick(c), exportShare: c.trade.exportShare, exportElasticity: c.trade.exportElasticity, passThrough: theta, lagMonths: 0 }).retailPct[0]!;
          }
          tot += Xc(c) * r;
        }
        pi[k] = tot / Xitem[k]!;
      }
      total += cvSecondOrder(Xitem, epsB, pi).cv;
    }
    return total;
  };
  const lowE = bandFor((c) => c.demand.range[0]);
  const highE = bandFor((c) => c.demand.range[1]);
  const band = { low: Math.min(lowE, highE, cv), high: Math.max(lowE, highE, cv), over: 'elasticity' as const };

  // substitution at the peak month
  let peakT = 0, peakMag = -1;
  piByMonth.forEach((pi, t) => { const mag = pi.reduce((a, b) => a + Math.abs(b), 0); if (mag > peakMag) { peakMag = mag; peakT = t; } });
  const sub = substitutionPct(eps, piByMonth[peakT] ?? [], ds.se);
  // other goods only: the shocked commodities' own items and the nonfood numeraire are not substitutes
  const shockedItems = new Set(commodities.map(itemOf));
  const substitution = ds.ids
    .map((id, i) => ({ commodity: id, quantityPct: sub.pct[i]!, significant: sub.significant[i]!, i }))
    .filter((s) => s.quantityPct !== 0 && !shockedItems.has(s.i) && !numeraire.has(s.i))
    .map(({ commodity, quantityPct, significant }) => ({ commodity, quantityPct, significant }));
  const cvAnnual = cvByMonth.slice(0, 12).reduce((a, b) => a + b, 0);

  // incidence: worst-hit commodity, per household by income quintile
  const worst = commodities.slice().sort((a, b) => byCommodity[b]! - byCommodity[a]!)[0];
  let incidence: ImpactResult['welfare']['incidence'] = [];
  if (worst) {
    const c = ctx.commodities[worst]!;
    const moving = retailPct[worst]!.filter((r) => r > 0);
    const avgPi = moving.length > 0 ? moving.reduce((a, b) => a + b, 0) / moving.length : 0;
    const monthsMoving = moving.length;
    const spendQ = ctx.quintileSpending?.[worst] ?? new Array<number>(5).fill((c.baseline.annualQuantity * c.baseline.retailPrice) / households);
    // annual spending × (months moving / 12) × average π
    incidence = incidenceByQuintile(spendQ.map((s) => (s * monthsMoving) / 12), avgPi, epsC[itemOf(worst)]![itemOf(worst)]!);
  }

  const durationMonths = commodities.reduce((d, id) => Math.max(d, ...retailPct[id]!.map((r, t) => (r > 1e-6 ? t + 1 : 0))), 0);

  return {
    months, commodities,
    price: { wholesalePct, retailPct, path: usePath },
    quantity: { pct: quantityPct },
    shortfall,
    domesticLossByRegion,
    welfare: { cv, cvByMonth, cvAnnual, ev, csReplica, band, byCommodity, substitution, incidence, producerRevenueChange },
    durationMonths,
    assumptions,
    checks: { slutskySymmetryAdjustment: sym.maxAdjustment, negativeSemidefinite: nsd.ok },
  };
}
