import { loadContext } from '@surge/config';
import type { EngineContext } from '@surge/engine';
import { interpretScenario, parseSeverity, validateCandidate, type ThreatCandidate, type ThreatCategory } from '@surge/engine';
import type { FeedAdapter, FeedResult, FeedItem } from './types.js';
import { httpText } from './http.js';
import { classifyHeadlines } from '../ai/news-llm.js';
import { readEnv } from '../env.js';

/**
 * Google News RSS (no key; the feed's terms allow personal, non-commercial use) → the deterministic interpreter →
 * "breaking" (anticipated) threats. A headline never becomes a number: only the region, category, commodities,
 * and a default severity, all validated against the configuration. Confidence = interpreter confidence × 0.8,
 * plus a little for each additional matching headline.
 *
 * Corroboration: a candidate becomes an item only when two different outlets report the same category and place
 * within the fetch window, or a single headline quotes a loss figure, or the outlet is a wire or official source.
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

/** Everything known about one category|region key: the best candidate, every supporting headline, and who reported it. */
export interface NewsSupport {
  c: ThreatCandidate; a: NewsArticle; n: number;
  articles: NewsArticle[];
  /** distinct outlets (source, trimmed, case-insensitive; an empty source is its own outlet) */
  outlets: Set<string>;
  /** some supporting headline quotes a loss figure ("40% of the crop lost") */
  lossFigure: boolean;
  /** some supporting headline comes from a wire service or an official body */
  wire: boolean;
  description?: string;
}

/** Wire services and official bodies whose single headline stands on its own. */
const WIRE_OR_OFFICIAL = /\b(reuters|associated press|bloomberg|usda|fao|aphis|noaa|drought monitor)\b|^ap(\s|$)|\bap news\b/i;

/**
 * Relief actions read as threats by the rules (a lifted ban still says "ban"): tariff-free, lifts, allows, eases,
 * pauses a tariff, shipping resumes, mines cleared, aid. "Resumes" and "returns" only count next to a trade or
 * shipping noun, so "strikes resume" is not relief.
 */
const RELIEF = /\b(tariff[- ]free|duty[- ]free|lifts?|lifted|lifting|allow(s|ing)?|eases?|easing|remov\w*|scraps?|scrapped|frees|freed|waives?|waived|exempts?|exempted|cuts? tariffs?|suspends? tariffs?|tariffs? (cut|pause|suspension|relief|exemption|waiver)s?|paus(e|es|ed|ing)( \w+){0,4} tariffs?|reopens?|(shipping|exports?|trade|traffic|transit|imports?|operations?|production|canal|port|markets?|containers?) (resumes?|rebounds?|returns?|recovers?)|resum\w* (shipping|exports?|trade|traffic|transit|imports?)|rebounds?|clears?|cleared|mine[- ]free|(is|are|remains?|stays?) open|push(es|ed)? back|postpon\w*|relief|aid|boosts?|compensation|declines? in new|drops? in new|turned the tide|milestone in)\b/i;

/**
 * Headline kinds that are never a disruption however many hazard words they carry: vigils, donations, studies,
 * explainers and questions, talks, wildlife, corporate stock moves, human hand-foot-and-mouth disease.
 */
const NON_EVENT = /\b(vigils?|memorial|fundrais\w*|donat\w*|charity|honou?rs|anniversary|tribute|recipes?|stud(y|ies|ying)|research\w*|webinar|surveys?|polls?|opinion|explainer|explained|fact[- ]check|podcast|gallery|factbox|talks?|negotiat\w*|deadline|looms?|progress|rescu\w*|wildlife|dolphins?|penguins?|pets|cats|dogs|zoo|hand,? foot,? and mouth|(stocks?|shares) (jump|rise|fall|slide|rall|gain|drop|surge|plunge)\w*|what to know|why (it|this) matters|how to|tour|scheduled|analysts?|analysis|contributor|what'?s (going on|behind|at stake)|video shows|watch:|live view|tracking)\b|^(how|why|what|is|are|will|can|could|should|does|do)\b|\?$/i;

/** Hypotheticals and forecasts: "could crush", "may cut", "if the ban holds", "fears", "outlook". */
const HEDGE = /\b(could|may|might|would|can|if|fears?|expected|forecasts?|forecasters|outlook|poised|projected|likely|concerns?)\b/i;

/** "Trade war", "price war", "beef with farmers" are not wars. */
const FIGURATIVE_WAR = /\b(trade|price|bidding|culture|turf|tariff|beef) wars?\b|\bwar of words\b/i;

/**
 * Categories the rules may only infer when the headline also carries disruption language for that category: a
 * tariff is imposed on something; a chokepoint is closed, attacked, mined or running below normal; a war has
 * strikes or troops; an input cost surges or runs short; a disease is detected, confirmed or spreading.
 * Weather and crop hazards need no verb: the hazard noun is the event.
 */
const ACTION: Partial<Record<ThreatCategory, RegExp>> = {
  tariff: /\b(impos\w*|slap\w*|hik\w*|rais\w*|new|announc\w*|threaten\w*|levy|levies|\d+ ?(%|percent))\b[^.]{0,40}\btariffs?\b|\btariffs?\b[^.]{0,30}\b(on|against)\b/i,
  chokepoint: /\b(clos(e|es|ed|ing|ure)|block(s|ed|ing|ade)?|attack\w*|strik(e|es|ing)|struck|hit(s|ting)?|mines?|mined|seiz\w*|halt\w*|disrupt\w*|plummet\w*|drop(s|ped)?|crater\w*|slump\w*|fall(s|en)?|fell|restrict\w*|reduc\w*|suspend\w*|rerout\w*|divert\w*|below|low|threaten\w*|delay\w*|limits?|cut\w*|shut\w*|choking|deepens?|escalat\w*|slow\w*|stall\w*|crisis|battles?|firing line|retaliat\w*)\b/i,
  war: /\b(invasion|invad\w*|missiles?|attack\w*|strik(e|es|ing)|struck|bomb\w*|shell\w*|troops|offensive|airstrikes?|fighting|retaliat\w*|fire)\b/i,
  instability: /\b(coup|riots?|unrest|protest\w*|clash\w*|collaps\w*|strikes?)\b/i,
  input_cost: /\b(surg\w*|soar\w*|spik\w*|jump\w*|record[- ]high|new high|record|shortag\w*|scarc\w*|crunch|climb\w*|ris(e|es|ing)|hik\w*|costlier|skyrocket\w*|doubl\w*|squeez\w*)\b/i,
  disease: /\b(detect\w*|confirm\w*|outbreaks?|cull\w*|depopulat\w*|kill\w*|hits?|reach\w*|spread\w*|cases?|infect\w*|emergency|quarantin\w*|found|positive|declar\w*|suspend\w*|shuts?|clos\w*|dies|died|dead|euthani\w*|lockdown|restrictions?|movement)\b/i,
  facility: /\b(clos\w*|shut\w*|halt\w*|recall\w*|fire|explosion|outage|strike|contaminat\w*)\b/i,
};
/** The US is the actor, not the place, when a headline says "U.S. sanctions" or "U.S. strikes". */
const US_IS_ACTOR = new Set<ThreatCategory>(['export_ban', 'embargo', 'war', 'instability']);

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

const outletOf = (a: NewsArticle): string => (a.source ?? '').trim().toLowerCase();

function support(best: Map<string, NewsSupport>, c: ThreatCandidate, a: NewsArticle, description?: string): void {
  const key = `${c.category}|${c.regionId}`;
  const lossFigure = parseSeverity(a.title) !== undefined;
  const wire = WIRE_OR_OFFICIAL.test(a.source ?? '');
  const cur = best.get(key);
  if (!cur) { best.set(key, { c, a, n: 1, articles: [a], outlets: new Set([outletOf(a)]), lossFigure, wire, description }); return; }
  cur.n += 1; cur.articles.push(a); cur.outlets.add(outletOf(a));
  cur.lossFigure ||= lossFigure; cur.wire ||= wire;
  if (c.confidence > cur.c.confidence) { cur.c = c; cur.a = a; cur.description = description; }
}

/** Why a key is corroborated ("3 outlets", "1 outlet, wire or official source", …), or undefined when it is not. */
export function corroboration(s: NewsSupport): string | undefined {
  if (s.outlets.size >= 2) return `${s.outlets.size} outlets`;
  if (s.lossFigure) return '1 outlet, loss figure quoted';
  if (s.wire) return '1 outlet, wire or official source';
  return undefined;
}

/** Rule-path disruption language for a candidate's category (see ACTION). */
function eventLanguage(c: ThreatCandidate, title: string): boolean {
  if (US_IS_ACTOR.has(c.category) && c.regionId === 'us-national') return false;
  if ((c.category === 'war' || c.category === 'instability') && FIGURATIVE_WAR.test(title)) return false;
  const re = ACTION[c.category];
  return !re || re.test(title);
}

/**
 * Screen headlines into corroborated category|region keys. Returns only the keys that become items, each with
 * every headline that supported it, so an evaluation can say which headlines were treated as events.
 */
/** Trade restrictions: the verb and the actors that make a restriction a threat to US supply. */
const BAN_VERB = /\b(bans?|banned|banning|suspends?|suspended|halts?|halted|blocks?|blocked|restricts?|restricted|embargo(?:es|ed)?|tariffs?|duties)\b/i;
const US_ACTOR = /\b(u\.?s\.?|u\.s\.a\.?|usa|united states|america|american|washington|white house|trump|usda|usmca)\b/i;
/**
 * "EU bans Brazilian beef" is a third-country import ban: it frees Brazilian supply for other buyers and does not cut
 * US imports. A restriction counts only when the actor (the words before the verb) is the supplier itself or the US.
 */
export function thirdCountryRestriction(title: string, category: string, regionId: string, ctx: EngineContext): boolean {
  const rule = ctx.threatTypes[category as ThreatCategory]?.rule;
  if (rule !== 'trade_block' && rule !== 'tariff') return false;
  const m = BAN_VERB.exec(title);
  if (!m) return false;
  const before = title.slice(0, m.index).toLowerCase();
  const region = ctx.regions[regionId];
  const names = [region?.name ?? '', ...(region?.countries ?? [])].filter(Boolean).map((x) => x.toLowerCase());
  const stem = (region?.name ?? '').toLowerCase().replace(/ia$/, 'i').replace(/a$/, '').replace(/y$/, '');
  const actorIsSupplier = names.some((n) => before.includes(n)) || (stem.length > 3 && before.includes(stem));
  return !actorIsSupplier && !US_ACTOR.test(before);
}

export function screen(raw: unknown): Map<string, NewsSupport & { why: string }> {
  const ctx = loadContext();
  const { articles: arts = [], classified } = raw as { articles?: NewsArticle[]; classified?: ClassifiedArticle[] };
  const best = new Map<string, NewsSupport>();
  if (classified) {
    // classified by the model and validated: only these count
    const NATIONWIDE = /\b(u\.?s\.?|u\.s\.a\.?|usa|united states|america|american|nationwide|national|across the country|farm belt|the nation)\b/i;
    for (const k of classified) {
      const a = arts[k.index]; if (!a) continue;
      if (k.confidence < 0.7) continue;
      if (RELIEF.test(a.title) || RELIEF.test(k.description)) continue;
      if (thirdCountryRestriction(a.title, k.category, k.regionId, ctx)) continue;
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
      support(best, c, a, k.description);
    }
  } else {
    const seen = new Set<string>();
    for (const a of arts) {
      // the same headline reaches several queries; it is one report, not several
      const t = a.title.trim().toLowerCase();
      if (seen.has(t)) continue;
      seen.add(t);
      if (RELIEF.test(a.title) || NON_EVENT.test(a.title) || HEDGE.test(a.title)) continue;
      for (const c of interpretScenario(a.title, ctx)) {
        // a headline must name both the kind of threat and the place; no defaults, no weak matches
        if (!c.explicitCategory || !c.explicitRegion || c.confidence < 0.75) continue;
        if (!eventLanguage(c, a.title)) continue;
        support(best, c, a);
      }
    }
  }
  const out = new Map<string, NewsSupport & { why: string }>();
  for (const [key, s] of best) {
    const why = corroboration(s);
    if (why) out.set(key, { ...s, why });
  }
  return out;
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
    const best = screen(raw);
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
    for (const [key, { c, a, n, why, description }] of best) {
      const r = ctx.regions[c.regionId]!;
      const item: FeedItem = {
        id: `news-${key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
        name: a.title.length > 90 ? a.title.slice(0, 87) + '…' : a.title,
        category: c.category, kind: ctx.threatTypes[c.category]?.kind ?? 'natural',
        regionId: c.regionId, admin: r.name, lat: r.lat, lng: r.lng,
        commodities: c.commodities, severity: capped(c, a.title), months: c.months,
        status: 'breaking', confidence: Math.min(1, c.confidence * 0.8 + 0.05 * (n - 1)),
        text: `${a.source || 'news'} · ${n} matching headline${n > 1 ? 's' : ''} from ${why} in 3 days · ${c.source === 'llm' ? 'classified by Gemini, validated' : `matched: ${c.matched.join(', ')}`} · ${a.link}`,
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
