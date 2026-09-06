import type { EngineContext, RegionConfig, Threat, ThreatCategory, SourceStamp } from '@surge/engine';
import type { FeedItem, FeedResult } from './feeds/types.js';

type ShareField = 'usSupplyShare' | 'usImportOriginShare' | 'worldExportShare' | 'chokepointImportShare';

/** Which region share drives commodity relevance, per the engine's shock rule for the category. */
function shareFieldFor(category: ThreatCategory, ctx: EngineContext): ShareField | null {
  const rule = ctx.threatTypes[category]?.rule;
  switch (rule) {
    case 'livestock_disease':
    case 'crop_hazard':
    case 'livestock_hazard':
      return 'usSupplyShare';
    case 'trade_block':
    case 'tariff':
      return 'usImportOriginShare';
    case 'world_price':
      return 'worldExportShare';
    case 'chokepoint':
      return 'chokepointImportShare';
    default:
      return null; // input_cost / facility / vulnerability_only: not region-derived here
  }
}

function bboxArea(b: RegionConfig['bbox']): number {
  return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
}

function contains(b: RegionConfig['bbox'], lng: number, lat: number): boolean {
  return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
}

/** Region whose share map is relevant and whose bbox contains the point; smallest (most specific) wins.
 * Hazards may also land in a foreign supplier region (import-origin shares), where they cut US imports. */
function findRegion(item: FeedItem, ctx: EngineContext, field: ShareField): RegionConfig | undefined {
  if (item.regionId) return ctx.regions[item.regionId];
  if (item.lat == null || item.lng == null) return undefined;
  const fields: ShareField[] = field === 'usSupplyShare' ? ['usSupplyShare', 'usImportOriginShare'] : [field];
  const candidates = Object.values(ctx.regions).filter((r) => r.id !== 'us-national' && fields.some((f) => { const shares = r[f]; return shares && Object.keys(shares).length > 0; }) && contains(r.bbox, item.lng!, item.lat!));
  return candidates.sort((a, b) => bboxArea(a.bbox) - bboxArea(b.bbox))[0];
}

/** Engine severity = fraction of the affected channel lost. Alert-scored hazards are scaled by the category's damage cap. */
export function severityFor(item: FeedItem, ctx: EngineContext): number {
  const s = item.severity ?? 0.5;
  if (!item.alertScore || !item.category) return Math.max(0, Math.min(1, s));
  const cap = ctx.threatTypes[item.category]?.damageAtSeverity1 ?? 1;
  return Math.max(0, Math.min(1, s * cap));
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Convert one feed's normalized items into engine Threats via the region gazetteer. */
export function feedItemsToThreats(items: FeedItem[], source: SourceStamp, ctx: EngineContext): Threat[] {
  const out: Threat[] = [];
  for (const item of items) {
    if (!item.category) continue;
    const field = shareFieldFor(item.category, ctx);
    if (!field) continue;
    const region = findRegion(item, ctx, field);
    if (!region) continue;

    // Commodities the region is relevant for, restricted to configured commodities/inputs.
    let commodities = item.commodities;
    if (!commodities) {
      const shares = region[field] ?? (field === 'usSupplyShare' ? region.usImportOriginShare : undefined) ?? {};
      commodities = Object.keys(shares)
        .filter((id) => ctx.commodities[id] || ctx.inputs[id])
        .map((id) => ({ id, relevance: 1 }));
    }
    if (commodities.length === 0) continue;

    const threat: Threat = {
      id: item.id,
      name: item.name,
      category: item.category,
      kind: item.kind ?? ctx.threatTypes[item.category]?.kind ?? 'natural',
      location: {
        lat: item.lat ?? region.lat,
        lng: item.lng ?? region.lng,
        admin: item.admin ?? region.name,
        regionId: region.id,
      },
      commodities,
      severity: severityFor(item, ctx),
      start: item.start ?? currentMonth(),
      source: { feed: source.feed, kind: source.kind },
    };
    if (item.status) threat.status = item.status;
    if (item.confidence !== undefined) threat.confidence = item.confidence;
    if (item.iso3) threat.location.iso3 = item.iso3;
    else if (region.countries?.length === 1) threat.location.iso3 = region.countries[0]!;
    if (item.physical) threat.physical = item.physical;
    if (item.months) threat.months = item.months;
    if (source.url) threat.source.url = source.url;
    if (source.fetchedAt) threat.source.fetchedAt = source.fetchedAt;
    if (source.stale) threat.source.stale = source.stale;
    if (item.text) threat.source.note = item.text;
    const gated = (item.raw as { gated?: Record<string, unknown> } | undefined)?.gated;
    if (gated) threat.gated = gated;
    out.push(threat);
  }
  return out;
}

/** Flatten several feed results into a single Threat list. */
export function threatsFromResults(results: FeedResult[], ctx: EngineContext): Threat[] {
  return results.flatMap((r) => feedItemsToThreats(r.items, r.source, ctx));
}
