import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { portwatch } from '../src/feeds/portwatch.js';

const raw = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/portwatch.json', import.meta.url)), 'utf8'));
const KNOWN_REGIONS = new Set(['suez-red-sea', 'panama-canal', 'hormuz']);

describe('portwatch adapter', () => {
  it('produces one item per chokepoint with a transit-decline severity in [0,1]', () => {
    const { items } = portwatch.parse(raw);
    expect(items.length).toBe(28);
    for (const it of items) {
      expect(it.category).toBe('chokepoint');
      expect(it.severity).toBeGreaterThanOrEqual(0);
      expect(it.severity).toBeLessThanOrEqual(1);
      expect(it.physical?.kind).toBe('transit_decline_fraction');
    }
  });

  it('maps the four gazetteer chokepoints to their regions', () => {
    const { items } = portwatch.parse(raw);
    const withRegion = items.filter((i) => i.regionId);
    expect(withRegion.length).toBeGreaterThanOrEqual(3);
    for (const it of withRegion) expect(KNOWN_REGIONS.has(it.regionId!)).toBe(true);
    expect(items.some((i) => i.regionId === 'suez-red-sea')).toBe(true);
  });
});
