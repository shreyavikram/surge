import { loadContext } from '@surge/config';
import { interpretScenario, type ThreatCandidate } from '@surge/engine';
import type { FeedAdapter, FeedResult, FeedItem } from './types.js';
import { httpText } from './http.js';

/**
 * Google News RSS (no key; the feed's terms allow personal, non-commercial use) → the deterministic interpreter →
 * "breaking" (anticipated) threats. A headline never becomes a number: only the region, category, commodities,
 * and a default severity, all validated against the configuration. Confidence = interpreter confidence × 0.8,
 * plus a little for each additional matching headline.
 */
const QUERIES = [
  '"export ban" (rice OR wheat OR sugar OR corn OR beef) when:3d',
  '"bird flu" (egg OR poultry OR turkey OR layers) when:3d',
  'tariff (tomatoes OR beef OR produce OR coffee OR food imports) when:3d',
  'drought (corn OR wheat OR cattle OR crops OR harvest) when:3d',
  '("Red Sea" OR Hormuz OR "Panama Canal" OR Suez) shipping when:3d',
  '(fertilizer OR urea OR ammonia) prices farmers when:3d',
  '("swine fever" OR "foot-and-mouth" OR "avian influenza") outbreak when:3d',
  '(flood OR wildfire OR hurricane) (farms OR crops OR citrus OR cattle) when:3d',
];

export interface NewsArticle { title: string; link: string; pubDate: string; source: string }

function decode(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").trim();
}

export function parseRss(xml: string): NewsArticle[] {
  const out: NewsArticle[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1]!;
    const g = (tag: string) => decode((it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)) ?? [])[1] ?? '');
    const title = g('title').replace(/\s+-\s+[^-]+$/, '');
    if (!title) continue;
    out.push({ title, link: g('link'), pubDate: g('pubDate'), source: g('source') });
  }
  return out;
}

function ym(pubDate: string): string | undefined {
  const d = new Date(pubDate);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 7);
}

export const news: FeedAdapter = {
  id: 'news',
  label: 'News (Google News RSS, interpreted)',
  kind: 'live',
  ttlMs: 60 * 60 * 1000,
  snapshotName: 'news',

  async fetch(): Promise<FeedResult> {
    const articles: NewsArticle[] = [];
    for (const q of QUERIES) {
      try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
        articles.push(...parseRss(await httpText(url, 15000)).slice(0, 40));
      } catch { /* one query failing must not sink the feed */ }
    }
    return this.parse({ articles });
  },

  parse(raw: unknown): FeedResult {
    const ctx = loadContext();
    const arts = (raw as { articles?: NewsArticle[] }).articles ?? [];
    const best = new Map<string, { c: ThreatCandidate; a: NewsArticle; n: number }>();
    for (const a of arts) {
      for (const c of interpretScenario(a.title, ctx)) {
        // a headline must name both the kind of threat and the place; no defaults, no weak matches
        if (!c.explicitCategory || !c.explicitRegion || c.confidence < 0.7) continue;
        const key = `${c.category}|${c.regionId}`;
        const cur = best.get(key);
        if (!cur) best.set(key, { c, a, n: 1 });
        else { cur.n += 1; if (c.confidence > cur.c.confidence) { cur.c = c; cur.a = a; } }
      }
    }
    const items: FeedItem[] = [];
    for (const [key, { c, a, n }] of best) {
      const r = ctx.regions[c.regionId]!;
      const item: FeedItem = {
        id: `news-${key.replace(/[^a-z0-9]+/gi, '-')}`,
        name: a.title.length > 90 ? a.title.slice(0, 87) + '…' : a.title,
        category: c.category, kind: ctx.threatTypes[c.category]?.kind ?? 'natural',
        regionId: c.regionId, admin: r.name, lat: r.lat, lng: r.lng,
        commodities: c.commodities, severity: c.severity, months: c.months,
        status: 'breaking', confidence: Math.min(1, c.confidence * 0.8 + 0.05 * (n - 1)),
        text: `${a.source || 'news'} · ${n} matching headline${n > 1 ? 's' : ''} in 3 days · matched: ${c.matched.join(', ')} · ${a.link}`,
      };
      const start = ym(a.pubDate);
      if (start) item.start = start;
      if (r.countries?.length === 1) item.iso3 = r.countries[0]!;
      items.push(item);
    }
    return { items, source: { feed: 'Google News RSS (interpreted; non-commercial use)', url: 'https://news.google.com', kind: 'live' } };
  },
};
