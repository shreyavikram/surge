// packages/engine/src/config-schema.ts
import type { EngineContext } from './types.js';

function req(problems: string[], path: string, v: unknown): void {
  if (v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isNaN(v))) {
    problems.push(`${path} is required`);
  }
}

export function validateConfig(ctx: EngineContext): string[] {
  const problems: string[] = [];
  const itemIds = new Set(ctx.demand.items.map((i) => i.id));
  const n = ctx.demand.items.length;
  if (ctx.demand.marshallian.length !== n || ctx.demand.marshallian.some((r) => r.length !== n)) {
    problems.push(`demand.marshallian must be ${n}x${n}`);
  }
  for (const item of ctx.demand.items) {
    req(problems, `demand.items.${item.id}.budgetShare`, item.budgetShare);
    if (item.budgetShare <= 0 || item.budgetShare >= 1) problems.push(`demand.items.${item.id}.budgetShare out of (0,1)`);
  }
  req(problems, 'demand.source', ctx.demand.source);
  for (const [id, c] of Object.entries(ctx.commodities)) {
    const p = `commodities.${id}`;
    if (c.id !== id) problems.push(`${p}.id must equal key`);
    if (!itemIds.has(c.group)) problems.push(`${p}.group "${c.group}" is not a demand item`);
    req(problems, `${p}.baseline.source`, c.baseline.source);
    req(problems, `${p}.demand.source`, c.demand.source);
    req(problems, `${p}.trade.source`, c.trade.source);
    req(problems, `${p}.supply.source`, c.supply.source);
    req(problems, `${p}.transmission.source`, c.transmission.source);
    if (!(c.baseline.annualQuantity > 0)) problems.push(`${p}.baseline.annualQuantity must be > 0`);
    if (!(c.baseline.retailPrice > 0)) problems.push(`${p}.baseline.retailPrice must be > 0`);
    if (!(c.demand.ownPrice < 0)) problems.push(`${p}.demand.ownPrice must be negative`);
    if (!(c.trade.exportElasticity <= 0)) problems.push(`${p}.trade.exportElasticity must be <= 0`);
    if (c.transmission.passThrough <= 0 || c.transmission.passThrough > 1.5) problems.push(`${p}.transmission.passThrough out of range`);
    if (c.supply.model === 'livestock') {
      req(problems, `${p}.supply.nationalInventory`, c.supply.nationalInventory);
      req(problems, `${p}.supply.recoveryLagMinMonths`, c.supply.recoveryLagMinMonths);
      req(problems, `${p}.supply.recoveryLagMaxMonths`, c.supply.recoveryLagMaxMonths);
    }
    for (const inp of c.inputs ?? []) {
      req(problems, `${p}.inputs.${inp.input}.source`, inp.source);
      if (!ctx.inputs[inp.input]) problems.push(`${p}.inputs.${inp.input} unknown input`);
    }
  }
  for (const [id, inp] of Object.entries(ctx.inputs)) {
    const p = `inputs.${id}`;
    if (inp.id !== id) problems.push(`${p}.id must equal key`);
    req(problems, `${p}.demand.source`, inp.demand.source);
    req(problems, `${p}.trade.source`, inp.trade.source);
    req(problems, `${p}.supply.source`, inp.supply.source);
    if (!(inp.demand.totalElasticity < 0)) problems.push(`${p}.demand.totalElasticity must be negative`);
  }
  for (const [id, r] of Object.entries(ctx.regions)) {
    req(problems, `regions.${id}.source`, r.source);
    for (const key of ['usSupplyShare', 'usImportOriginShare', 'worldExportShare', 'chokepointImportShare'] as const) {
      for (const [cid, share] of Object.entries(r[key] ?? {})) {
        if (!ctx.commodities[cid] && !ctx.inputs[cid]) problems.push(`regions.${id}.${key}.${cid} unknown commodity or input`);
        if (share < 0 || share > 1) problems.push(`regions.${id}.${key}.${cid} out of [0,1]`);
      }
    }
  }
  for (const l of ctx.levers) {
    req(problems, `levers.${l.id}.source`, l.source);
    if (!ctx.commodities[l.commodity]) problems.push(`levers.${l.id}.commodity unknown`);
    if (l.requires && !ctx.levers.some((o) => o.id === l.requires)) problems.push(`levers.${l.id}.requires unknown lever`);
  }
  req(problems, 'population.source', ctx.population.source);
  req(problems, 'totalExpenditure.source', ctx.totalExpenditure.source);
  return problems;
}
