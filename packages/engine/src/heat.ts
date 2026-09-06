// packages/engine/src/heat.ts
// Map heat: every supplier country and US state gets a status and an intensity.
//   stable      green   a supplier with no threat; shade = its share of US food imports (countries) or production (states)
//   anticipated yellow  a reported, not yet confirmed, disruption (breaking items); shade = the same supply share
//   unstable    red     a disruption under way (active items); shade = the same supply share
// The hue carries the status; the shade carries only how much of the US supply the place provides.
// Saturation points are stated in HEAT_SATURATION and shown in the legend.
import type { EngineContext, Threat } from './types.js';

/** A state producing less than this share of a commodity (0.1% of US output) is not coloured for threats to it. */
export const MIN_STATE_SHARE = 0.001;

export type HeatStatus = 'none' | 'stable' | 'anticipated' | 'unstable';
export interface AreaHeat {
  id: string;
  status: HeatStatus;
  intensity: number;      // 0..1 after saturation
  baseline: number;       // import or production share (raw)
  disruption: number;     // raw share disrupted by active threats
  anticipated: number;    // raw share threatened by breaking items × confidence
  threats: string[];      // threat ids touching the area, active first
}

export const HEAT_SATURATION = { importShare: 0.25, disruption: 0.05, productionShare: 0.15, lensImportShare: 0.5, lensProductionShare: 0.3 };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Retail value of imports per commodity as a share of all commodities' import value. */
export function commodityImportWeights(ctx: EngineContext): Record<string, number> {
  const w: Record<string, number> = {};
  let tot = 0;
  for (const c of Object.values(ctx.commodities)) { const v = c.baseline.annualQuantity * c.baseline.retailPrice * c.trade.importShare; w[c.id] = v; tot += v; }
  for (const inp of Object.values(ctx.inputs)) { const v = 5e9 * inp.trade.importShare; w[inp.id] = v; tot += v; } // inputs carry a nominal value; documented
  for (const k of Object.keys(w)) w[k] = tot > 0 ? w[k]! / tot : 0;
  return w;
}

/** Retail value of domestic production per commodity as a share of all domestic production value. */
export function commodityDomesticWeights(ctx: EngineContext): Record<string, number> {
  const w: Record<string, number> = {};
  let tot = 0;
  for (const c of Object.values(ctx.commodities)) { const v = c.baseline.annualQuantity * c.baseline.retailPrice * (1 - c.trade.importShare); w[c.id] = v; tot += v; }
  for (const inp of Object.values(ctx.inputs)) { const v = 5e9 * (1 - inp.trade.importShare); w[inp.id] = v; tot += v; }
  for (const k of Object.keys(w)) w[k] = tot > 0 ? w[k]! / tot : 0;
  return w;
}

export function threatCountries(threat: Threat, ctx: EngineContext): string[] {
  const out = new Set<string>();
  if (threat.location.iso3 && threat.location.iso3 !== 'USA') out.add(threat.location.iso3);
  const r = threat.location.regionId ? ctx.regions[threat.location.regionId] : undefined;
  for (const c of r?.countries ?? []) out.add(c);
  return [...out];
}

/**
 * Hue = status (green stable, yellow reported, red disrupted). Shade = how much of US supply comes from here,
 * on a square-root scale so small suppliers still register; never certainty or loss.
 */
function classify(baseline: number, disruption: number, anticipated: number, satBase: number, ids: { active: string[]; breaking: string[] }): Omit<AreaHeat, 'id'> {
  const shade = baseline > 0 ? clamp01(0.15 + 0.85 * Math.sqrt(baseline / satBase)) : 0.35;
  if (ids.active.length > 0) return { status: 'unstable', intensity: shade, baseline, disruption, anticipated, threats: [...ids.active, ...ids.breaking] };
  if (ids.breaking.length > 0) return { status: 'anticipated', intensity: shade, baseline, disruption, anticipated, threats: ids.breaking };
  // no measurable supply to the US and nothing reported: grey, not green
  if (baseline <= 0) return { status: 'none', intensity: 0, baseline, disruption, anticipated, threats: [] };
  return { status: 'stable', intensity: clamp01(Math.sqrt(baseline / satBase)), baseline, disruption, anticipated, threats: [] };
}

/** Share of US imports of the lens commodities that come from a region (import-value weighted). */
function lensOriginShare(ctx: EngineContext, regionId: string | undefined, lens: string[], w: Record<string, number>): number {
  const r = regionId ? ctx.regions[regionId] : undefined;
  if (!r) return 0;
  let num = 0, den = 0;
  for (const c of lens) { const wc = w[c] ?? 0; den += wc; num += wc * (r.usImportOriginShare?.[c] ?? 0); }
  return den > 0 ? num / den : 0;
}

/** Supplier countries: status from the threats that touch them; shade from their share of US imports
 * (of all food, or of the lens commodities when a lens is given). */
export function countryHeat(threats: Threat[], ctx: EngineContext, lens?: string[]): Record<string, AreaHeat> {
  const w = commodityImportWeights(ctx);
  const lensSet = lens && lens.length > 0 ? new Set(lens) : null;
  if (lensSet) threats = threats.filter((t) => t.commodities.some((c) => lensSet.has(c.id)));
  const acc: Record<string, { disruption: number; anticipated: number; active: string[]; breaking: string[] }> = {};
  for (const t of threats) {
    const region = t.location.regionId ? ctx.regions[t.location.regionId] : undefined;
    const isos = threatCountries(t, ctx);
    if (isos.length === 0) continue;
    // share of US food-import value this threat removes: severity × origin share × commodity weight
    let share = 0;
    for (const { id, relevance } of t.commodities) {
      if (lensSet && !lensSet.has(id)) continue;             // under a commodity filter only that commodity colours the country
      const origin = region?.usImportOriginShare?.[id] ?? (region?.worldExportShare?.[id] ?? 0) * 0.5;
      share += t.severity * relevance * origin * (w[id] ?? 0);
    }
    for (const iso of isos) {
      const a = (acc[iso] ??= { disruption: 0, anticipated: 0, active: [], breaking: [] });
      if (t.status === 'breaking') { a.anticipated += share * (t.confidence ?? 0.5); a.breaking.push(t.id); }
      else { a.disruption += share; a.active.push(t.id); }
    }
  }
  const out: Record<string, AreaHeat> = {};
  const all = new Set<string>([...Object.keys(ctx.countries?.countries ?? {}), ...Object.keys(acc)]);
  // region lookup by country for the lens
  const regionOf: Record<string, string> = {};
  for (const r of Object.values(ctx.regions)) for (const iso of r.countries ?? []) regionOf[iso] ??= r.id;
  for (const iso of all) {
    const baseline = lensSet ? lensOriginShare(ctx, regionOf[iso], [...lensSet], w) : (ctx.countries?.countries[iso]?.usFoodImportShare ?? 0);
    const a = acc[iso] ?? { disruption: 0, anticipated: 0, active: [], breaking: [] };
    out[iso] = { id: iso, ...classify(baseline, a.disruption, a.anticipated, lensSet ? HEAT_SATURATION.lensImportShare : HEAT_SATURATION.importShare, a) };
  }
  return out;
}

/** US states: shade from production share (of all food, or of the lens commodities); status from domestic threats
 * whose region covers the state. */
export function stateHeat(threats: Threat[], ctx: EngineContext, lens?: string[]): Record<string, AreaHeat> {
  const cfg = ctx.focus;
  if (!cfg) return {};
  const w = commodityDomesticWeights(ctx);
  const lensSet = lens && lens.length > 0 ? new Set(lens) : null;
  if (lensSet) threats = threats.filter((t) => t.commodities.some((c) => lensSet.has(c.id)));
  const states = cfg.areas.filter((a) => a.kind === 'state');
  const baseline: Record<string, number> = {};
  for (const s of states) {
    let b = 0, den = 0;
    for (const [cid, shares] of Object.entries(cfg.production)) {
      if (lensSet && !lensSet.has(cid)) continue;
      b += (shares[s.id] ?? 0) * (w[cid] ?? 0); den += w[cid] ?? 0;
    }
    baseline[s.id] = lensSet ? (den > 0 ? b / den : 0) : b;
  }
  const acc: Record<string, { disruption: number; anticipated: number; active: string[]; breaking: string[] }> = {};
  for (const t of threats) {
    const rid = t.location.regionId;
    const region = rid ? ctx.regions[rid] : undefined;
    const covered = rid ? cfg.regionStates[rid] : undefined;
    if (!region || covered === undefined) continue; // not a domestic region
    const members = covered.length === 0 ? states.map((s) => s.id) : covered;
    for (const st of members) {
      let share = 0;
      for (const { id, relevance } of t.commodities) {
        if (lensSet && !lensSet.has(id)) continue;           // under a commodity filter only that commodity colours the state
        const regionShare = region.usSupplyShare?.[id] ?? 0;
        const pState = cfg.production[id]?.[st] ?? 0;
        const pRegion = members.reduce((s, m) => s + (cfg.production[id]?.[m] ?? 0), 0);
        if (regionShare === 0 || pRegion === 0 || pState < MIN_STATE_SHARE) continue; // a state that grows next to none of it is not affected
        share += t.severity * relevance * regionShare * (pState / pRegion) * (w[id] ?? 0);
      }
      if (share === 0) continue;
      const a = (acc[st] ??= { disruption: 0, anticipated: 0, active: [], breaking: [] });
      if (t.status === 'breaking') { a.anticipated += share * (t.confidence ?? 0.5); a.breaking.push(t.id); }
      else { a.disruption += share; a.active.push(t.id); }
    }
  }
  const out: Record<string, AreaHeat> = {};
  for (const s of states) {
    const a = acc[s.id] ?? { disruption: 0, anticipated: 0, active: [], breaking: [] };
    out[s.id] = { id: s.id, ...classify(baseline[s.id] ?? 0, a.disruption, a.anticipated, lensSet ? HEAT_SATURATION.lensProductionShare : HEAT_SATURATION.productionShare, a) };
  }
  return out;
}
