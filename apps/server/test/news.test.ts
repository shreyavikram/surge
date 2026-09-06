import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import type { ThreatCategory } from '@surge/engine';
import { parseRss, news, screen } from '../src/feeds/news.js';

const rss = `<?xml version="1.0"?><rss><channel>
<item><title>India bans rice exports as monsoon fails - Reuters</title><link>https://x/1</link><pubDate>Fri, 04 Sep 2026 10:00:00 GMT</pubDate><source url="https://reuters.com">Reuters</source></item>
<item><title>Bird flu detected at Iowa layer farm; 2 million hens to be culled - AP</title><link>https://x/2</link><pubDate>Sat, 05 Sep 2026 10:00:00 GMT</pubDate><source url="https://ap.org">AP</source></item>
<item><title>Weather is nice in Paris this weekend - Le Monde</title><link>https://x/3</link><pubDate>Sat, 05 Sep 2026 10:00:00 GMT</pubDate><source url="https://lemonde.fr">Le Monde</source></item>
<item><title><![CDATA[Houthi strikes close Red Sea shipping lanes &amp; reroute coffee cargoes - FT]]></title><link>https://x/4</link><pubDate>Sat, 05 Sep 2026 12:00:00 GMT</pubDate><source url="https://ft.com">FT</source></item>
<item><title>Red Sea attacks force carriers to reroute around Africa - Lloyd's List</title><link>https://x/5</link><pubDate>Sat, 05 Sep 2026 13:00:00 GMT</pubDate><source url="https://lloydslist.com">Lloyd's List</source></item>
</channel></rss>`;

describe('news adapter', () => {
  it('parses RSS items, strips the source suffix, and decodes entities', () => {
    const a = parseRss(rss);
    expect(a).toHaveLength(5);
    expect(a[0]!.title).toBe('India bans rice exports as monsoon fails');
    expect(a[3]!.title).toContain('Red Sea shipping lanes & reroute');
    expect(a[1]!.source).toBe('AP');
  });
  it('turns relevant headlines into breaking items and drops the rest', () => {
    const r = news.parse({ articles: parseRss(rss) });
    const ids = r.items.map((i) => i.id);
    expect(r.items.every((i) => i.status === 'breaking' && (i.confidence ?? 0) > 0)).toBe(true);
    expect(ids.some((i) => i.includes('export-ban-india'))).toBe(true);
    expect(ids.some((i) => i.includes('disease-us-state-ia'))).toBe(true);
    expect(ids.some((i) => i.includes('chokepoint-suez-red-sea'))).toBe(true);
    expect(r.items.some((i) => /Paris/.test(i.name))).toBe(false);
    expect(r.items.find((i) => i.id.includes('india'))!.start).toBe('2026-09');
    // the Red Sea item is corroborated by two outlets; India and Iowa stand on a wire service
    expect(r.items.find((i) => i.id.includes('suez-red-sea'))!.text).toContain('2 outlets');
    expect(r.items.find((i) => i.id.includes('india'))!.text).toContain('wire or official');
  });
});

describe('national placement of classified headlines', () => {
  const art = (title: string) => ({ title, link: 'https://example.com', pubDate: '2026-09-05T00:00:00Z', source: 'Reuters' });
  const cls = (index: number, description: string) => ({ index, category: 'drought' as const, regionId: 'us-national', commodities: ['beef'], severity: 0.1, months: 12, confidence: 0.9, description });
  it('moves a headline that names a state onto that state', () => {
    const r = news.parse({ articles: [art('Drought forces Nebraska ranchers to sell cattle early')], classified: [cls(0, 'Drought is cutting cattle herds.')] });
    expect(r.items.length).toBe(1);
    expect(r.items[0]!.regionId).toBe('us-state-NE');
  });
  it('drops a US story with neither nationwide words nor a state', () => {
    const r = news.parse({ articles: [art('Grand County rancher says drought outweighs beef tariff relief')], classified: [cls(0, 'A rancher describes drought losses.')] });
    expect(r.items).toEqual([]);
  });
  it('keeps a nationwide story national, with the headline cap', () => {
    const r = news.parse({ articles: [art('Heat dome tightens grip on U.S. farms as drought spreads')], classified: [cls(0, 'Drought across the country.')] });
    expect(r.items[0]?.regionId).toBe('us-national');
    expect(r.items[0]?.severity).toBeCloseTo(0.03, 6);
  });
});

describe('two-outlet corroboration', () => {
  const art = (title: string, source: string) => ({ title, link: 'https://example.com', pubDate: '2026-09-05T00:00:00Z', source });
  it('keeps a drought reported by two different outlets, as one item naming both', () => {
    const r = news.parse({ articles: [art('Drought shrinks Kansas wheat harvest', 'Farm Progress'), art('Kansas wheat withers as drought deepens', 'DTN')] });
    expect(r.items.length).toBe(1);
    expect(r.items[0]!.regionId).toBe('us-state-KS');
    expect(r.items[0]!.category).toBe('drought');
    expect(r.items[0]!.text).toContain('2 matching headlines from 2 outlets');
  });
  it('drops a single headline from a local paper', () => {
    const r = news.parse({ articles: [art('Drought shrinks Kansas wheat harvest', 'Hutchinson News')] });
    expect(r.items).toEqual([]);
  });
  it('does not count the same outlet twice, whatever the case or spacing', () => {
    const r = news.parse({ articles: [art('Drought shrinks Kansas wheat harvest', 'Farm Progress'), art('Kansas wheat withers as drought deepens', ' farm progress ')] });
    expect(r.items).toEqual([]);
  });
  it('keeps a single Reuters headline', () => {
    const r = news.parse({ articles: [art('Drought shrinks Kansas wheat harvest', 'Reuters')] });
    expect(r.items.length).toBe(1);
    expect(r.items[0]!.text).toContain('1 matching headline from 1 outlet, wire or official source');
  });
  it('keeps a single local headline that quotes a loss figure', () => {
    const r = news.parse({ articles: [art('Drought destroys 40% of the Kansas wheat crop', 'Hutchinson News')] });
    expect(r.items.length).toBe(1);
    expect(r.items[0]!.severity).toBeCloseTo(0.4, 6);
    expect(r.items[0]!.text).toContain('loss figure quoted');
  });
  it('applies to classified headlines too', () => {
    const cls = { index: 0, category: 'drought' as const, regionId: 'us-state-KS', commodities: ['wheat'], severity: 0.1, months: 6, confidence: 0.9, description: 'Drought is cutting the Kansas wheat harvest.' };
    expect(news.parse({ articles: [art('Drought shrinks Kansas wheat harvest', 'Hutchinson News')], classified: [cls] }).items).toEqual([]);
    expect(news.parse({ articles: [art('Drought shrinks Kansas wheat harvest', 'Reuters')], classified: [cls] }).items.length).toBe(1);
  });
  it('treats an empty source as one outlet of its own', () => {
    const r = news.parse({ articles: [art('Drought shrinks Kansas wheat harvest', ''), art('Kansas wheat withers as drought deepens', '')] });
    expect(r.items).toEqual([]);
  });
});

/**
 * Precision and recall of the deterministic rule path over a hand-labelled set of live Google News headlines
 * (test/fixtures/headlines-labelled.json). A headline counts as a positive when it supports any produced item.
 * The rule path is deliberately conservative: precision matters more than recall.
 */
interface Labelled { title: string; source: string; isEvent: boolean; category?: string; regionId?: string; note?: string }
const labelled = JSON.parse(readFileSync(new URL('./fixtures/headlines-labelled.json', import.meta.url), 'utf8')) as Labelled[];
const articles = labelled.map((h) => ({ title: h.title, source: h.source, link: '', pubDate: '' }));
const items = news.parse({ articles }).items;
const positives = new Set<string>();
for (const s of screen({ articles }).values()) for (const a of s.articles) positives.add(a.title);
let tp = 0, fp = 0, fn = 0, tn = 0;
const falsePositives: string[] = [], falseNegatives: string[] = [];
for (const h of labelled) {
  const p = positives.has(h.title);
  if (p && h.isEvent) tp++;
  else if (p) { fp++; falsePositives.push(`${h.title} [${h.source}]`); }
  else if (h.isEvent) { fn++; falseNegatives.push(`${h.title} [${h.source}]`); }
  else tn++;
}
const precision = tp / Math.max(1, tp + fp), recall = tp / Math.max(1, tp + fn);

describe(`rule path on ${labelled.length} labelled headlines (${labelled.filter((h) => h.isEvent).length} events): TP ${tp} FP ${fp} FN ${fn} TN ${tn}, precision ${precision.toFixed(2)}, recall ${recall.toFixed(2)}, ${items.length} items`, () => {
  it('has a labelled set with at least 50 events and 100 non-events, all ids from the configuration', async () => {
    const { loadContext } = await import('@surge/config');
    const ctx = loadContext();
    expect(labelled.filter((h) => h.isEvent).length).toBeGreaterThanOrEqual(50);
    expect(labelled.filter((h) => !h.isEvent).length).toBeGreaterThanOrEqual(100);
    for (const h of labelled) {
      if (h.category) expect(ctx.threatTypes[h.category as ThreatCategory], h.title).toBeDefined();
      if (h.regionId) expect(ctx.regions[h.regionId], h.title).toBeDefined();
    }
    expect(new Set(labelled.map((h) => h.title.toLowerCase())).size).toBe(labelled.length);
  });
  it(`precision ≥ 0.8 (false positives: ${fp})`, () => {
    console.log(`rule path false positives (${fp}):\n  ${falsePositives.join('\n  ')}`);
    expect(precision, `precision ${precision.toFixed(3)}; false positives:\n${falsePositives.join('\n')}`).toBeGreaterThanOrEqual(0.8);
  });
  it(`recall ≥ 0.3 (false negatives: ${fn})`, () => {
    console.log(`rule path false negatives (${fn}):\n  ${falseNegatives.join('\n  ')}`);
    expect(recall, `recall ${recall.toFixed(3)}`).toBeGreaterThanOrEqual(0.3);
  });
  it('every produced item is backed by at least one labelled headline', () => {
    expect(items.length).toBe(screen({ articles }).size);
    expect(positives.size).toBeGreaterThan(0);
  });
});

describe('trade restrictions need the right actor', () => {
  const art = (title: string, source = 'Reuters') => ({ title, link: 'https://example.com', pubDate: '2026-09-05T00:00:00Z', source });
  const cls = (index: number, category: 'export_ban' | 'tariff', regionId: string) => ({ index, category, regionId, commodities: ['beef'], severity: 0.5, months: 6, confidence: 0.9, description: 'Trade action.' });
  it("drops a third country's ban on a supplier (EU bans Brazilian beef) — it does not cut US supply", () => {
    const r = news.parse({ articles: [art('Factbox-EU ban on animal products affects $1.8 billion in Brazilian exports')], classified: [cls(0, 'export_ban', 'brazil')] });
    expect(r.items).toEqual([]);
  });
  it('keeps a supplier restricting its own exports and a US action on an origin', () => {
    const r1 = news.parse({ articles: [art('Brazil suspends beef exports after a cattle disease case')], classified: [cls(0, 'export_ban', 'brazil')] });
    expect(r1.items.length).toBe(1);
    const r2 = news.parse({ articles: [art('Trump imposes 25% tariff on Mexican tomatoes')], classified: [cls(0, 'tariff', 'mexico')] });
    expect(r2.items.length).toBe(1);
  });
});
