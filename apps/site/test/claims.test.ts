import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * The site states counts on its face — 20 commodities, 17 threat types, 436 districts.
 * A marketing page that quietly drifts from the model it describes is worse than one
 * that says nothing, so every claim is pinned to the file it came from.
 */

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..');
const repo = join(site, '..', '..');

const html = readFileSync(join(site, 'index.html'), 'utf8');
const read = (p: string) => JSON.parse(readFileSync(join(repo, p), 'utf8'));

/** The number printed in the stat bar under a given label. */
function statBarClaim(label: string): number {
  const pattern = new RegExp(
    `<span class="sb-num">(\\d+)</span><span class="sb-label">${label}</span>`,
  );
  const match = html.match(pattern);
  if (!match) throw new Error(`no stat bar entry labelled "${label}"`);
  return Number(match[1]);
}

/** The count badge on a coverage tab, e.g. `Retail commodities <b>20</b>`. */
function tabClaim(label: string): number {
  const pattern = new RegExp(`${label} <b>(\\d+)</b>`);
  const match = html.match(pattern);
  if (!match) throw new Error(`no coverage tab labelled "${label}"`);
  return Number(match[1]);
}

describe('stat bar', () => {
  it('counts the retail commodities the engine prices', () => {
    const commodities = read('packages/config/data/commodities.json');
    expect(statBarClaim('Retail commodities')).toBe(Object.keys(commodities).length);
  });

  it('counts the upstream inputs', () => {
    const inputs = read('packages/config/data/inputs.json');
    expect(statBarClaim('Upstream farm inputs')).toBe(Object.keys(inputs).length);
  });

  it('counts the items in the ERS demand system', () => {
    const demand = read('packages/config/data/demand-system.json');
    expect(statBarClaim('Item demand system')).toBe(demand.items.length);
  });

  it('counts the threat types', () => {
    const threats = read('packages/config/data/threat-types.json');
    expect(statBarClaim('Threat types')).toBe(Object.keys(threats).length);
  });

  it('counts the congressional districts it can resolve', () => {
    const geo = read('apps/web/public/geo/cd119.geojson');
    expect(statBarClaim('Congressional districts')).toBe(geo.features.length);
  });

  it('counts the feed adapters actually wired into the server', () => {
    const index = readFileSync(join(repo, 'apps/server/src/feeds/index.ts'), 'utf8');
    const list = index.match(/allAdapters: FeedAdapter\[\] = \[([^\]]+)\]/);
    expect(list).not.toBeNull();
    const wired = list![1].split(',').filter((s) => s.trim().length).length;
    expect(statBarClaim('Public data feeds')).toBe(wired);
  });
});

describe('coverage tabs', () => {
  it('agree with the stat bar', () => {
    expect(tabClaim('Retail commodities')).toBe(statBarClaim('Retail commodities'));
    expect(tabClaim('Upstream inputs')).toBe(statBarClaim('Upstream farm inputs'));
    expect(tabClaim('Threat types')).toBe(statBarClaim('Threat types'));
    expect(tabClaim('Data feeds')).toBe(statBarClaim('Public data feeds'));
  });

  it('counts the relief levers', () => {
    const levers = read('packages/config/data/levers.json');
    const count = Array.isArray(levers) ? levers.length : Object.keys(levers).length;
    expect(tabClaim('Relief levers')).toBe(count);
  });

  it('lists every retail commodity by the name the engine uses', () => {
    const commodities: Record<string, { name: string }> = read(
      'packages/config/data/commodities.json',
    );
    const panel = html.slice(html.indexOf('id="tab-retail"'), html.indexOf('id="tab-inputs"'));
    for (const { name } of Object.values(commodities)) {
      expect(panel, `retail tab is missing "${name}"`).toContain(`<li>${name} `);
    }
  });

  it('lists every upstream input', () => {
    const inputs: Record<string, { name: string }> = read('packages/config/data/inputs.json');
    const panel = html.slice(html.indexOf('id="tab-inputs"'), html.indexOf('id="tab-threats"'));
    for (const { name } of Object.values(inputs)) {
      // Parentheticals in the config name become <em> qualifiers in the markup.
      const head = name.replace(/\s*\(.*\)$/, '');
      expect(panel, `inputs tab is missing "${head}"`).toContain(`<li>${head}`);
    }
  });

  it('lists every threat type across the four families', () => {
    const threats: Record<string, unknown> = read('packages/config/data/threat-types.json');
    const panel = html.slice(html.indexOf('id="tab-threats"'), html.indexOf('id="tab-levers"'));
    for (const id of Object.keys(threats)) {
      const label = id.replace(/_/g, ' ');
      const shown = new RegExp(`<li>${label}</li>`, 'i').test(panel);
      expect(shown, `threats tab is missing "${label}"`).toBe(true);
    }
  });
});

describe('generated graphics', () => {
  const maps = readFileSync(join(site, 'assets', 'maps.js'), 'utf8');

  it('carries a shape for every district the site claims to cover', () => {
    const geo = read('apps/web/public/geo/cd119.geojson');
    // At-large states carry ids like "DE-AL" alongside the numbered "CA-15".
    const ids = maps.match(/"id":"[A-Z]{2}-(?:\d+|AL)"/g) ?? [];
    expect(new Set(ids).size).toBe(geo.features.length);
  });

  it('colours the world map from real import values, not placeholders', () => {
    const shares = maps.match(/"share":([\d.]+)/g)?.map((s) => Number(s.split(':')[1])) ?? [];
    expect(shares.length).toBeGreaterThan(100);
    const total = shares.reduce((a, b) => a + b, 0);
    // Every origin's share of one total, so they sum to 1 up to the rounding we store at.
    expect(total).toBeGreaterThan(0.99);
    expect(total).toBeLessThan(1.01);
  });
});
