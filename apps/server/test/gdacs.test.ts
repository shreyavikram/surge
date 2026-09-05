import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gdacs } from '../src/feeds/gdacs.js';

const raw = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/gdacs.json', import.meta.url)), 'utf8'));

describe('gdacs adapter', () => {
  it('parses events into normalized natural-hazard items', () => {
    const { items, source } = gdacs.parse(raw);
    expect(items.length).toBeGreaterThan(0);
    expect(source.feed).toBe('GDACS');
    for (const it of items) {
      expect(['flood', 'storm', 'wildfire', 'drought']).toContain(it.category);
      expect([0.2, 0.5, 1.0]).toContain(it.severity);
      expect(it.kind).toBe('natural');
      expect(typeof it.lat).toBe('number');
      expect(typeof it.lng).toBe('number');
      if (it.start) expect(it.start).toMatch(/^\d{4}-\d{2}$/);
    }
  });
});
