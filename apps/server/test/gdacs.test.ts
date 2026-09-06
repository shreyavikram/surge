import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gdacs, affectedShare, affectedPopulation } from '../src/feeds/gdacs.js';

const raw = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/gdacs.json', import.meta.url)), 'utf8'));
const MEX_POP = 128455567; // packages/config/data/country-population.json

function feature(over: Record<string, unknown>, coords: [number, number] = [-99, 20]) {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: coords }, properties: { eventtype: 'TC', eventid: 1, name: 'test', description: 'Tropical Cyclone TEST', alertlevel: 'Orange', country: 'Mexico', iso3: 'MEX', fromdate: '2026-09-01T00:00:00', todate: '2026-09-05T00:00:00', ...over } };
}

describe('gdacs adapter', () => {
  it('parses Orange and Red events into normalized natural-hazard items and drops Green ones', () => {
    const { items, source } = gdacs.parse(raw);
    expect(items.length).toBeGreaterThan(0);
    expect(source.feed).toBe('GDACS');
    const levels = new Map(raw.features.map((f: { properties: { eventid: number; alertlevel: string } }) => [`gdacs-${f.properties.eventid}`, f.properties.alertlevel]));
    for (const it of items) {
      expect(['flood', 'storm', 'wildfire', 'drought']).toContain(it.category);
      expect(['Orange', 'Red']).toContain(levels.get(it.id));
      // the fixture carries no affected-population field, so every event is scaled by the default 0.5 share
      expect([0.25, 0.5]).toContain(it.severity);
      expect(it.kind).toBe('natural');
      expect(typeof it.lat).toBe('number');
      expect(typeof it.lng).toBe('number');
      if (it.start) expect(it.start).toMatch(/^\d{4}-\d{2}$/);
      expect(it.text).toMatch(/assumed 50% of the national scale/);
    }
    const green = gdacs.parse({ features: [feature({ alertlevel: 'Green' })] });
    expect(green.items).toEqual([]);
  });

  it('scales the alert by the share of the country the event affects', () => {
    const orange = gdacs.parse({ features: [feature({ alertlevel: 'Orange', population: 300000 })] }).items[0]!;
    expect(orange.severity).toBeCloseTo(0.5 * Math.min(1, 300000 / (0.15 * MEX_POP)), 6);
    expect(orange.severity).toBeCloseTo(0.0078, 3);
    expect(orange.text).toMatch(/300,000 people affected of 128M/);
    const red = gdacs.parse({ features: [feature({ alertlevel: 'Red', population: 30e6 })] }).items[0]!;
    expect(red.severity).toBe(1);
    // per-event payloads wrap the number; strings are tolerated; unknown countries fall back to the default share
    expect(affectedPopulation({ eventtype: 'TC', eventid: 1, population: { value: '2500' } })).toBe(2500);
    expect(affectedPopulation({ eventtype: 'TC', eventid: 1 })).toBeUndefined();
    expect(affectedShare('MEX', undefined)).toBe(0.5);
    expect(affectedShare('XXX', 1000)).toBe(0.5);
    expect(affectedShare('MEX', 0)).toBe(0);
  });
});
