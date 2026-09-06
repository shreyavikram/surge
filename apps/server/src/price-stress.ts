import { priceAnomaly, type PriceAnomaly } from '@surge/engine';
import { loadContext } from '@surge/config';
import type { FeedItem, FeedResult } from './feeds/types.js';

/**
 * FAO-style price stress on US retail prices, joined to the Census import declines.
 *
 * 1. For every commodity with a BLS average-price (or CPI) series, score the latest month with the FAO
 *    Indicator of Food Price Anomalies (engine/anomaly.ts): moderately high ≥ 0.5, abnormally high ≥ 1.
 * 2. An import-decline threat (feeds/trade.ts) is anticipated (yellow) on its own: official data show the
 *    channel shrinking. When the same commodity's store price is moderately or abnormally high, the
 *    shortfall is already on shelves: the threat becomes active (red) and its summary says so.
 */
export interface StressRow {
  commodity: string;
  name: string;
  series: string;
  anomaly: PriceAnomaly | null;
}

/** Score every commodity that has a series in the FRED feed result. */
export function priceStress(series: FeedResult['series'] | undefined, seriesIds: Record<string, string>): StressRow[] {
  const ctx = loadContext();
  const out: StressRow[] = [];
  for (const [commodity, sid] of Object.entries(seriesIds)) {
    const c = ctx.commodities[commodity] ?? ctx.inputs[commodity];
    if (!c) continue;
    const s = series?.[commodity];
    out.push({ commodity, name: c.name, series: sid, anomaly: s ? priceAnomaly(s.months, s.values) : null });
  }
  return out.sort((a, b) => (b.anomaly?.ifpa ?? -99) - (a.anomaly?.ifpa ?? -99));
}

export function levelText(level: PriceAnomaly['level']): string {
  switch (level) {
    case 'abnormally-high': return 'abnormally high';
    case 'moderately-high': return 'moderately high';
    case 'moderately-low': return 'moderately low';
    case 'abnormally-low': return 'abnormally low';
    default: return 'normal';
  }
}

/** Upgrade import-decline items whose commodity shows store-price stress; annotate the rest. */
export function applyPriceStress(items: FeedItem[], stress: StressRow[]): FeedItem[] {
  const byCommodity = new Map(stress.map((s) => [s.commodity, s.anomaly] as const));
  return items.map((item) => {
    if (item.category !== 'import_decline') return item;
    const commodity = item.commodities?.[0]?.id;
    const a = commodity ? byCommodity.get(commodity) : undefined;
    if (!a) return { ...item, summary: `${item.summary ?? ''} No US retail price series is tracked for this item, so whether the shortfall has reached shelves is not measured.`.trim() };
    const score = a.ifpa.toFixed(1);
    if (a.level === 'abnormally-high' || a.level === 'moderately-high') {
      return {
        ...item, status: 'active', confidence: 1,
        summary: `${item.summary ?? ''} US store prices for this item are ${levelText(a.level)} for the season (FAO price-anomaly score ${score} in ${a.month}), so the shortfall is already showing on shelves.`.trim(),
      };
    }
    return { ...item, summary: `${item.summary ?? ''} US store prices for this item are still ${levelText(a.level)} for the season (FAO price-anomaly score ${score} in ${a.month}), so the effect has not reached shelves yet.`.trim() };
  });
}
