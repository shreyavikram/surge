import { describe, it, expect } from 'vitest';
import { parseRss, news } from '../src/feeds/news.js';

const rss = `<?xml version="1.0"?><rss><channel>
<item><title>India bans rice exports as monsoon fails - Reuters</title><link>https://x/1</link><pubDate>Fri, 04 Sep 2026 10:00:00 GMT</pubDate><source url="https://reuters.com">Reuters</source></item>
<item><title>Bird flu detected at Iowa layer farm; 2 million hens to be culled - AP</title><link>https://x/2</link><pubDate>Sat, 05 Sep 2026 10:00:00 GMT</pubDate><source url="https://ap.org">AP</source></item>
<item><title>Weather is nice in Paris this weekend - Le Monde</title><link>https://x/3</link><pubDate>Sat, 05 Sep 2026 10:00:00 GMT</pubDate><source url="https://lemonde.fr">Le Monde</source></item>
<item><title><![CDATA[Houthi strikes close Red Sea shipping lanes &amp; reroute coffee cargoes - FT]]></title><link>https://x/4</link><pubDate>Sat, 05 Sep 2026 12:00:00 GMT</pubDate><source url="https://ft.com">FT</source></item>
</channel></rss>`;

describe('news adapter', () => {
  it('parses RSS items, strips the source suffix, and decodes entities', () => {
    const a = parseRss(rss);
    expect(a).toHaveLength(4);
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
  });
});

describe('national placement of classified headlines', () => {
  const art = (title: string) => ({ title, link: 'https://example.com', pubDate: '2026-09-05T00:00:00Z', source: 'Test' });
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
