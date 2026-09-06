import { loadContext } from '@surge/config';
import { interpretScenario, type ThreatCandidate } from '@surge/engine';
import type { FeedAdapter, FeedResult, FeedItem } from './types.js';
import { httpText } from './http.js';

/**
 * GDELT news: headlines about food-supply disruptions become "breaking" (anticipated) threats through the
 * deterministic interpreter. Confidence = interpreter confidence × 0.8 (a headline is not a series).
 * GDELT allows one request every 5 seconds; this adapter makes one and caches for an hour.
 */
// GDELT rejects long queries; keep this compact and let the interpreter do the classification.
const QUERY = '("export ban" OR "bird flu" OR drought OR tariff OR embargo OR blockade OR wildfire OR flood) (wheat OR rice OR eggs OR corn OR fertilizer OR beef OR dairy OR coffee OR tomatoes)';
export interface GdeltArticle { url: string; title: string; seendate: string; sourcecountry?: string; domain?: string }

export const gdelt: FeedAdapter = {
  id: 'gdelt',
  label: 'GDELT news (breaking)',
  kind: 'live',
  ttlMs: 60 * 60 * 1000,
  snapshotName: 'gdelt',

  async fetch(): Promise<FeedResult> {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(QUERY)}&mode=artlist&maxrecords=60&format=json&timespan=3d&sort=datedesc`;
    const text = await httpText(url, 8000);
    let parsed: { articles?: GdeltArticle[] };
    try { parsed = JSON.parse(text) as { articles?: GdeltArticle[] }; } catch { throw new Error(`GDELT: ${text.slice(0, 80)}`); }
    return this.parse(parsed);
  },

  parse(raw: unknown): FeedResult {
    const ctx = loadContext();
    const arts = (raw as { articles?: GdeltArticle[] }).articles ?? [];
    const best = new Map<string, { c: ThreatCandidate; a: GdeltArticle; n: number }>();
    for (const a of arts) {
      for (const c of interpretScenario(a.title, ctx)) {
        if (c.confidence < 0.5) continue;
        const key = `${c.category}|${c.regionId}`;
        const cur = best.get(key);
        if (!cur) best.set(key, { c, a, n: 1 });
        else { cur.n += 1; if (c.confidence > cur.c.confidence) { cur.c = c; cur.a = a; } }
      }
    }
    const items: FeedItem[] = [];
    for (const [key, { c, a, n }] of best) {
      const r = ctx.regions[c.regionId]!;
      const seen = a.seendate ? `${a.seendate.slice(0, 4)}-${a.seendate.slice(4, 6)}` : undefined;
      const item: FeedItem = {
        id: `news-${key.replace(/[^a-z0-9]+/gi, '-')}`,
        name: a.title.length > 90 ? a.title.slice(0, 87) + '…' : a.title,
        category: c.category, kind: ctx.threatTypes[c.category]?.kind ?? 'natural',
        regionId: c.regionId, admin: r.name, lat: r.lat, lng: r.lng,
        commodities: c.commodities, severity: c.severity, months: c.months,
        status: 'breaking', confidence: Math.min(1, c.confidence * 0.8 + 0.05 * (n - 1)),
        text: `${a.domain ?? ''} ${a.url} (${n} matching headline${n > 1 ? 's' : ''}; matched: ${c.matched.join(', ')})`,
      };
      if (seen) item.start = seen;
      if (r.countries?.length === 1) item.iso3 = r.countries[0]!;
      items.push(item);
    }
    return { items, source: { feed: 'GDELT news (interpreted)', url: 'https://www.gdeltproject.org', kind: 'live' } };
  },
};
