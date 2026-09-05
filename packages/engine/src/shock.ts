// packages/engine/src/shock.ts
import type { EngineContext, Threat, Shock, CommodityConfig, InputConfig, SourceStamp } from './types.js';
import { livestockShortfall, cropShortfall, manufacturingShortfall } from './biology.js';
import { retailPriceChange } from './price.js';

/** Modeled constants (documented in DECISIONS.md and surfaced as assumptions by impact.ts). */
export const SHOCK_CONSTANTS = {
  REROUTING_SHARE: 0.3,              // share of blocked imports replaced from other origins within the period
  WORLD_PRICE_TRANSMISSION: 0.5,     // world price rise per unit of lost world-export share × severity
  FREIGHT_WEDGE_AT_FULL_CLOSURE: 0.05, // wholesale cost wedge when a chokepoint fully closes
  DELAY_MONTHS: 1,                   // months of rerouting delay shortfall at full closure
  FACILITY_OUT_SHARE: 0.75,          // share of the threat duration a facility stays fully offline
  FACILITY_RAMP_MONTHS: 2,
};

function months(threat: Threat, ctx: EngineContext): number {
  return threat.months ?? ctx.threatTypes[threat.category]?.defaultMonths ?? 6;
}

function stamp(threat: Threat, note: string): SourceStamp {
  return { ...threat.source, note };
}

function supplyShock(threat: Threat, c: CommodityConfig, path: number[], label: string): Shock {
  return { kind: 'supply', commodity: c.id, region: threat.location.regionId ?? 'unknown', start: threat.start, supplyPath: path,
    passThrough: c.transmission.passThrough, lagMonths: c.transmission.lagMonths, provenance: [stamp(threat, label)], label };
}

function costShock(threat: Threat, c: CommodityConfig, costPath: number[], label: string, via?: string): Shock {
  const s: Shock = { kind: 'cost', commodity: c.id, region: threat.location.regionId ?? 'unknown', start: threat.start,
    supplyPath: new Array<number>(costPath.length).fill(0), costPath,
    passThrough: c.transmission.passThrough, lagMonths: c.transmission.lagMonths, provenance: [stamp(threat, label)], label };
  if (via) s.via = via;
  return s;
}

/** Convert an input price path into cost shocks for every commodity that uses the input. */
function propagateInput(threat: Threat, inputId: string, pricePath: number[], ctx: EngineContext, label: string): Shock[] {
  const out: Shock[] = [];
  for (const c of Object.values(ctx.commodities)) {
    const link = (c.inputs ?? []).find((x) => x.input === inputId);
    if (!link) continue;
    out.push(costShock(threat, c, pricePath.map((p) => p * link.costShare), `${label} via ${inputId} (cost share ${link.costShare})`, inputId));
  }
  return out;
}

/** Input market clearing at the farm/wholesale level (θ = 1). */
function inputPricePath(inp: InputConfig, supplyPath: number[]): number[] {
  return supplyPath.map((s) => (s > 0 ? retailPriceChange(s, { eps: inp.demand.totalElasticity, exportShare: inp.trade.exportShare, exportElasticity: inp.trade.exportElasticity, passThrough: 1, lagMonths: 0 }) : 0));
}

/** Crop losses begin at the shock month and run one marketing year (seasonal timing simplified; DECISIONS.md). */
function cropPathFor(id: string, ctx: EngineContext, lossFraction: number, regionShare: number, n: number): number[] {
  const supply = ctx.commodities[id]?.supply ?? ctx.inputs[id]?.supply;
  const stocks = supply?.stocksToUse ?? 0;
  return cropShortfall({ yieldLossFraction: lossFraction, affectedShare: regionShare, lossMonth: 0, marketingMonths: n, stocksToUse: stocks, months: n });
}

export function threatToShocks(threat: Threat, ctx: EngineContext, severityOverride?: number): Shock[] {
  const type = ctx.threatTypes[threat.category];
  if (!type || type.rule === 'vulnerability_only') return [];
  const sev = Math.max(0, severityOverride ?? threat.severity);
  const n = months(threat, ctx);
  const region = threat.location.regionId ? ctx.regions[threat.location.regionId] : undefined;
  const K = SHOCK_CONSTANTS;
  const out: Shock[] = [];

  for (const { id, relevance } of threat.commodities) {
    const c = ctx.commodities[id];
    const inp = ctx.inputs[id];
    if (!c && !inp) continue;
    const rel = Math.max(0, Math.min(1, relevance));

    switch (type.rule) {
      case 'livestock_disease': {
        if (!c || c.supply.model !== 'livestock') break;
        const inv = c.supply.nationalInventory!;
        const lagShift = ctx.overrides?.recoveryLagShiftMonths ?? 0;
        const events = threat.physical?.timeline
          ? threat.physical.timeline.map((e) => ({ month: e.month, headLost: e.value * sev * rel }))
          : [{ month: 0, headLost: (threat.physical?.value ?? 0) * sev * rel }];
        const path = livestockShortfall(events, { inventory: inv, lagMin: c.supply.recoveryLagMinMonths! + lagShift, lagMax: c.supply.recoveryLagMaxMonths! + lagShift, producerOffset: c.supply.producerOffset ?? 0, months: n });
        out.push(supplyShock(threat, c, path, threat.name));
        break;
      }
      case 'crop_hazard':
      case 'livestock_hazard': {
        const damage = (type.damageAtSeverity1 ?? 0.2) * sev * rel;
        const share = region?.usSupplyShare?.[id] ?? 0;
        if (share === 0 || damage === 0) break;
        if (inp) {
          const supplyPath = cropPathFor(id, ctx, damage, share, n);
          out.push(...propagateInput(threat, id, inputPricePath(inp, supplyPath), ctx, threat.name));
        } else if (c) {
          const path = c.supply.model === 'livestock' ? new Array<number>(n).fill(damage * share) : cropPathFor(id, ctx, damage, share, n);
          out.push(supplyShock(threat, c, path, threat.name));
        }
        break;
      }
      case 'trade_block': {
        const blocked = threat.physical?.kind === 'import_share_blocked' ? threat.physical.value * sev : sev;
        const origin = region?.usImportOriginShare?.[id] ?? 0;
        if (c) {
          const loss = c.trade.importShare * origin * blocked * (1 - K.REROUTING_SHARE) * rel;
          out.push(supplyShock(threat, c, new Array<number>(n).fill(loss), threat.name));
        } else if (inp) {
          const loss = inp.trade.importShare * origin * blocked * (1 - K.REROUTING_SHARE) * rel;
          out.push(...propagateInput(threat, id, inputPricePath(inp, new Array<number>(n).fill(loss)), ctx, threat.name));
        }
        break;
      }
      case 'tariff': {
        const rate = threat.physical?.kind === 'tariff_rate' ? threat.physical.value * sev : 0.1 * sev;
        const origin = region?.usImportOriginShare?.[id] ?? 1;
        if (c) {
          out.push(costShock(threat, c, new Array<number>(n).fill(rate * c.trade.importShare * origin * rel), threat.name));
        } else if (inp) {
          out.push(...propagateInput(threat, id, new Array<number>(n).fill(rate * inp.trade.importShare * origin * rel), ctx, threat.name));
        }
        break;
      }
      case 'world_price': {
        const worldShare = region?.worldExportShare?.[id] ?? 0;
        const worldPrice = worldShare * sev * K.WORLD_PRICE_TRANSMISSION * rel;
        if (worldPrice === 0) break;
        if (c) {
          const exposure = Math.max(c.trade.importShare, c.trade.exportShare);
          out.push(costShock(threat, c, new Array<number>(n).fill(worldPrice * exposure), threat.name));
        } else if (inp) {
          const exposure = Math.max(inp.trade.importShare, inp.trade.exportShare);
          out.push(...propagateInput(threat, id, new Array<number>(n).fill(worldPrice * exposure), ctx, threat.name));
        }
        break;
      }
      case 'chokepoint': {
        const decline = threat.physical?.kind === 'transit_decline_fraction' ? threat.physical.value * sev : sev;
        const share = region?.chokepointImportShare?.[id] ?? 0;
        if (share === 0 || decline === 0) break;
        const wedge = K.FREIGHT_WEDGE_AT_FULL_CLOSURE * decline * rel;
        const delayPath = (importShare: number): number[] => new Array<number>(n).fill(0).map((_, t) => (t < K.DELAY_MONTHS ? importShare * share * decline * rel : 0));
        if (c) {
          out.push({ ...supplyShock(threat, c, delayPath(c.trade.importShare), threat.name), costPath: new Array<number>(n).fill(wedge) });
        } else if (inp) {
          const price = inputPricePath(inp, delayPath(inp.trade.importShare)).map((p) => p + wedge);
          out.push(...propagateInput(threat, id, price, ctx, threat.name));
        }
        break;
      }
      case 'input_cost': {
        if (!inp) break;
        const rise = threat.physical?.kind === 'input_price_increase' ? threat.physical.value * sev : 0.2 * sev;
        out.push(...propagateInput(threat, id, new Array<number>(n).fill(rise * rel), ctx, threat.name));
        break;
      }
      case 'facility': {
        if (!c) break;
        const outFrac = threat.physical?.kind === 'capacity_out_fraction' ? threat.physical.value * sev : 0.1 * sev;
        const outMonths = Math.max(1, Math.round(n * K.FACILITY_OUT_SHARE));
        const path = manufacturingShortfall({ capacityOutFraction: outFrac * rel, outMonths, rampMonths: K.FACILITY_RAMP_MONTHS, months: n });
        out.push(supplyShock(threat, c, path, threat.name));
        break;
      }
      default:
        break;
    }
  }
  return out;
}
