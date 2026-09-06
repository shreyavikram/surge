// Precision and recall of the news feed over the hand-labelled headline set (test/fixtures/headlines-labelled.json),
// on the rule path and, with GEMINI_API_KEY in .env, on the Gemini path. Run: npx tsx scripts/eval-news.ts
import { readFileSync, existsSync } from 'node:fs';
import { loadContext } from '@surge/config';
import { readEnv } from '../src/env.js';
import { classifyHeadlines } from '../src/ai/news-llm.js';
import { news, screen, type ClassifiedArticle, type NewsArticle } from '../src/feeds/news.js';

interface Labelled { title: string; source: string; isEvent: boolean; category?: string; regionId?: string; note?: string }

/** Load KEY=VALUE lines from the repository .env without overriding what the shell already set. */
function loadDotEnv(): void {
  const path = new URL('../../../.env', import.meta.url);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2]!.replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]!] === undefined && v !== '') process.env[m[1]!] = v;
  }
}

function evaluate(label: string, labelled: Labelled[], articles: NewsArticle[], classified?: ClassifiedArticle[]) {
  const raw = classified ? { articles, classified } : { articles };
  const items = news.parse(raw).items;
  const positives = new Set<string>();
  const keyOf = new Map<string, string>();
  for (const [key, s] of screen(raw)) for (const a of s.articles) { positives.add(a.title); keyOf.set(a.title, key); }
  let tp = 0, fp = 0, fn = 0, tn = 0;
  const fps: string[] = [], fns: string[] = [], cat = { agree: 0, total: 0 }, reg = { agree: 0, total: 0 };
  for (const h of labelled) {
    const p = positives.has(h.title);
    if (p && h.isEvent) {
      tp++;
      const [c, r] = keyOf.get(h.title)!.split('|');
      if (h.category) { cat.total++; if (c === h.category) cat.agree++; }
      if (h.regionId) { reg.total++; if (r === h.regionId) reg.agree++; }
    } else if (p) { fp++; fps.push(`  ${h.title} [${h.source}] → ${keyOf.get(h.title)}${h.note ? ` (${h.note})` : ''}`); }
    else if (h.isEvent) { fn++; fns.push(`  ${h.title} [${h.source}] (${h.category}${h.regionId ? `|${h.regionId}` : ''}${h.note ? `; ${h.note}` : ''})`); }
    else tn++;
  }
  const precision = tp / Math.max(1, tp + fp), recall = tp / Math.max(1, tp + fn);
  console.log(`\n=== ${label} ===`);
  console.log(`items ${items.length} · TP ${tp} FP ${fp} FN ${fn} TN ${tn} · precision ${precision.toFixed(3)} · recall ${recall.toFixed(3)} · F1 ${(2 * precision * recall / Math.max(1e-9, precision + recall)).toFixed(3)}`);
  console.log(`category agreement on true positives ${cat.agree}/${cat.total} · region agreement ${reg.agree}/${reg.total}`);
  console.log(`false positives (${fp}):\n${fps.join('\n') || '  none'}`);
  console.log(`false negatives (${fn}):\n${fns.join('\n') || '  none'}`);
  return { precision, recall, tp, fp, fn, tn };
}

loadDotEnv();
const env = readEnv();
const ctx = loadContext();
const labelled = JSON.parse(readFileSync(new URL('../test/fixtures/headlines-labelled.json', import.meta.url), 'utf8')) as Labelled[];
const articles: NewsArticle[] = labelled.map((h) => ({ title: h.title, source: h.source, link: '', pubDate: '' }));
console.log(`${labelled.length} labelled headlines, ${labelled.filter((h) => h.isEvent).length} events`);

evaluate('rule path (no Gemini)', labelled, articles);

if (!env.GEMINI_API_KEY) {
  console.log('\nGEMINI_API_KEY is not set: skipping the Gemini path.');
} else {
  const t0 = Date.now();
  const map = await classifyHeadlines(articles.map((a) => a.title), ctx, env.GEMINI_API_KEY);
  console.log(`\nGemini classified ${map.size} of ${articles.length} headlines as events in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (map.size === 0) {
    console.log('The Gemini call returned nothing (failure or no events): only the rule-path numbers stand.');
  } else {
    const classified: ClassifiedArticle[] = [...map.entries()].map(([index, v]) => ({ index, category: v.c.category, regionId: v.c.regionId, commodities: v.c.commodities.map((x) => x.id), severity: v.c.severity, months: v.c.months, confidence: v.c.confidence, description: v.description }));
    evaluate('Gemini path (classified, validated, corroborated)', labelled, articles, classified);
    // the raw classifier, before the feed's place, relief and corroboration guards
    let tp = 0, fp = 0, fn = 0;
    const raw = new Set([...map.keys()].map((i) => articles[i]!.title));
    for (const h of labelled) { const p = raw.has(h.title); if (p && h.isEvent) tp++; else if (p) fp++; else if (h.isEvent) fn++; }
    console.log(`\nraw Gemini isEvent before the feed's guards: TP ${tp} FP ${fp} FN ${fn} · precision ${(tp / Math.max(1, tp + fp)).toFixed(3)} · recall ${(tp / Math.max(1, tp + fn)).toFixed(3)}`);
  }
}
