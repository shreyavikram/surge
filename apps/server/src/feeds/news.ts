import { loadContext } from '@surge/config';
import { interpretScenario, parseSeverity, validateCandidate, type ThreatCandidate } from '@surge/engine';
import type { FeedAdapter, FeedResult, FeedItem } from './types.js';
import { httpText } from './http.js';
import { classifyHeadlines } from '../ai/news-llm.js';
import { readEnv } from '../env.js';

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
export interface ClassifiedArticle { index: number; category: ThreatCandidate['category']; regionId: string; commodities: string[]; severity: number; months: number; confidence: number; description: string }

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

  async fetch(env): Promise<FeedResult> {
    const articles: NewsArticle[] = [];
    for (const q of QUERIES) {
      try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
        articles.push(...parseRss(await httpText(url, 15000)).slice(0, 40));
      } catch { /* one query failing must not sink the feed */ }
    }
    // Gemini screens headlines (event or not, place, commodities, plain description); rules take over without a key
    const key = env?.GEMINI_API_KEY ?? readEnv().GEMINI_API_KEY;
    let classified: ClassifiedArticle[] | undefined;
    if (key && articles.length > 0) {
      const ctx = loadContext();
      const seen = new Set<string>();
      const unique = articles.filter((a) => { const k = a.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
      const map = await classifyHeadlines(unique.map((a) => a.title), ctx, key);
      if (map.size > 0) classified = [...map.entries()].map(([i, v]) => ({ index: articles.indexOf(unique[i]!), category: v.c.category, regionId: v.c.regionId, commodities: v.c.commodities.map((x) => x.id), severity: v.c.severity, months: v.c.months, confidence: v.c.confidence, description: v.description }));
    }
    return this.parse({ articles, classified });
  },

  parse(raw: unknown): FeedResult {
    const ctx = loadContext();
    const { articles: arts = [], classified } = raw as { articles?: NewsArticle[]; classified?: ClassifiedArticle[] };
    const best = new Map<string, { c: ThreatCandidate; a: NewsArticle; n: number; description?: string }>();
    if (classified) {
      // classified by the model and validated: only these count
      const NATIONWIDE = /\b(u\.?s\.?|u\.s\.a\.?|usa|united states|america|american|nationwide|national|across the country|farm belt|the nation)\b/i;
      const RELIEF = /\b(tariff[- ]free|lifts?|lifted|lifting|allow(s|ing)?|eases?|easing|removes?|removing|cuts? tariff|suspends? tariff|reopens?|resumes?|aid)\b/i;
      for (const k of classified) {
        const a = arts[k.index]; if (!a) continue;
        if (k.confidence < 0.7) continue;
        if (RELIEF.test(a.title) || RELIEF.test(k.description)) continue;
        // A nationwide placement needs nationwide words; a headline that names a state is about that state; a US story
        // with neither is not placeable (a county rancher's drought is not 3% of the national herd).
        let regionId = k.regionId;
        if (regionId === 'us-national') {
          const state = interpretScenario(a.title, ctx).map((x) => x.regionId).find((r) => r.startsWith('us-state-'));
          if (state) regionId = state;
          else if (!NATIONWIDE.test(a.title) && !NATIONWIDE.test(k.description ?? '')) continue;
        }
        const c: ThreatCandidate = { name: a.title, category: k.category, regionId, commodities: k.commodities.map((id) => ({ id, relevance: 1 })), severity: k.severity, months: k.months, confidence: k.confidence, matched: ['gemini'], source: 'llm', explicitCategory: true, explicitRegion: true };
        if (validateCandidate(c, ctx).length > 0) continue;
        const key = `${c.category}|${c.regionId}`;
        const cur = best.get(key);
        if (!cur) best.set(key, { c, a, n: 1, description: k.description });
        else { cur.n += 1; if (c.confidence > cur.c.confidence) { cur.c = c; cur.a = a; cur.description = k.description; } }
      }
    } else {
      for (const a of arts) {
        for (const c of interpretScenario(a.title, ctx)) {
          // a headline must name both the kind of threat and the place; no defaults, no weak matches
          if (!c.explicitCategory || !c.explicitRegion || c.confidence < 0.75) continue;
          const key = `${c.category}|${c.regionId}`;
          const cur = best.get(key);
          if (!cur) best.set(key, { c, a, n: 1 });
          else { cur.n += 1; if (c.confidence > cur.c.confidence) { cur.c = c; cur.a = a; } }
        }
      }
    }
    // A headline that states no loss figure cannot justify more than a few percent of a whole country's output,
    // nor more than the category default of a region's: cap hazard, disease and world-price severities unless
    // the headline itself quotes a loss percentage. Trade actions keep their defaults (an export ban is a cut channel).
    const HEADLINE_CAP_NATIONAL = 0.03, HEADLINE_CAP_REGIONAL = 0.15;
    const capped = (c: ThreatCandidate, title: string): number => {
      const rule = ctx.threatTypes[c.category]?.rule;
      if (!rule || !['crop_hazard', 'livestock_hazard', 'livestock_disease', 'world_price'].includes(rule)) return c.severity;
      if (parseSeverity(title) !== undefined) return c.severity;
      return Math.min(c.severity, c.regionId === 'us-national' ? HEADLINE_CAP_NATIONAL : HEADLINE_CAP_REGIONAL);
    };
    const items: FeedItem[] = [];
    for (const [key, { c, a, n, description }] of best) {
      const r = ctx.regions[c.regionId]!;
      const item: FeedItem = {
        id: `news-${key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
        name: a.title.length > 90 ? a.title.slice(0, 87) + '…' : a.title,
        category: c.category, kind: ctx.threatTypes[c.category]?.kind ?? 'natural',
        regionId: c.regionId, admin: r.name, lat: r.lat, lng: r.lng,
        commodities: c.commodities, severity: capped(c, a.title), months: c.months,
        status: 'breaking', confidence: Math.min(1, c.confidence * 0.8 + 0.05 * (n - 1)),
        text: `${a.source || 'news'} · ${n} matching headline${n > 1 ? 's' : ''} in 3 days · ${c.source === 'llm' ? 'classified by Gemini, validated' : `matched: ${c.matched.join(', ')}`} · ${a.link}`,
      };
      if (description) item.summary = description;
      const start = ym(a.pubDate);
      if (start) item.start = start;
      if (r.countries?.length === 1) item.iso3 = r.countries[0]!;
      items.push(item);
    }
    return { items, source: { feed: 'Google News RSS (interpreted; non-commercial use)', url: 'https://news.google.com', kind: 'live' } };
  },
};
