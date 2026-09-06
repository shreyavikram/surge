// Builds the two vector maps the marketing site draws, from the same geometry and the
// same cited data the terminal uses. Nothing here is illustrative: the world map is
// coloured by each country's share of US food imports (Census customs value) and the
// district map by each district's share of national production (NASS Census of Ag).
//
//   node apps/site/tools/build-graphics.mjs
//
// Writes apps/site/assets/maps.js. Re-run when the underlying data files change.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { geoNaturalEarth1, geoAlbersUsa } from 'd3-geo';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const read = (p) => JSON.parse(readFileSync(join(repo, p), 'utf8'));

const WORLD = { width: 960, height: 430 };
const US = { width: 960, height: 600 };

/** Perpendicular distance from p to the segment ab, in projected pixels. */
function segmentDistance(p, a, b) {
  let x = a[0], y = a[1];
  let dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  return Math.hypot(p[0] - x, p[1] - y);
}

/** Douglas-Peucker. Coastline detail below a pixel is bytes the reader never sees. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  let index = 0, furthest = 0;
  const last = points.length - 1;
  for (let i = 1; i < last; i++) {
    const d = segmentDistance(points[i], points[0], points[last]);
    if (d > furthest) { furthest = d; index = i; }
  }
  if (furthest <= tolerance) return [points[0], points[last]];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

/**
 * Projects a feature and writes it as an SVG path, simplified to `tolerance` pixels and
 * with rings whose bounding box is under `minArea` square pixels dropped entirely.
 * geoAlbersUsa returns null outside the United States, so unprojectable points are skipped.
 */
function toPath(feature, projection, { tolerance, minArea, digits = 1 }) {
  const geometry = feature.geometry;
  if (!geometry) return '';
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon' ? geometry.coordinates
        : [];
  const fmt = (n) => Number(n.toFixed(digits));
  const draw = (points) => {
    let d = `M${fmt(points[0][0])} ${fmt(points[0][1])}`;
    for (let i = 1; i < points.length; i++) d += `L${fmt(points[i][0])} ${fmt(points[i][1])}`;
    return d + 'Z';
  };

  let out = '';
  // A district smaller than the sliver threshold is still a district. Whatever the
  // filter rejects, the feature's largest ring is kept so nothing silently disappears
  // from a map that names its own count.
  let largest = null;
  let largestArea = -1;

  for (const polygon of polygons) {
    for (const ring of polygon) {
      const projected = [];
      for (const coord of ring) {
        const p = projection(coord);
        if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) projected.push(p);
      }
      if (projected.length < 4) continue;
      const points = simplify(projected, tolerance);
      if (points.length < 4) continue;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of points) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const area = (maxX - minX) * (maxY - minY);
      if (area > largestArea) { largestArea = area; largest = points; }
      if (area < minArea) continue;
      out += draw(points);
    }
  }

  if (!out && largest) out = draw(largest);
  return out;
}

// ---------------------------------------------------------------- world map

/**
 * Share of US food imports by origin country: every commodity's customs value summed
 * per origin, over the total across all commodities. US Census general imports.
 */
function importShares() {
  const origin = read('packages/config/data/origin-shares.json');
  const byCountry = new Map();
  let total = 0;
  for (const entry of Object.values(origin.byCommodity)) {
    for (const [iso3, o] of Object.entries(entry.origins)) {
      const usd = o.valueUsd || 0;
      byCountry.set(iso3, (byCountry.get(iso3) || 0) + usd);
      total += usd;
    }
  }
  const shares = new Map();
  for (const [iso3, usd] of byCountry) shares.set(iso3, usd / total);
  return { shares, total, window: origin.window, source: origin.source };
}

function buildWorld() {
  const source = read('apps/web/public/geo/countries.geojson');
  // Antarctica ships no food and, in an equal-area world projection, is a smear along
  // the bottom edge that costs more vertical room than the rest of the map.
  const geo = {
    ...source,
    features: source.features.filter((f) => f.properties.iso3 !== 'ATA'),
  };
  const { shares, total, window } = importShares();
  const projection = geoNaturalEarth1().fitSize([WORLD.width, WORLD.height], geo);

  const countries = [];
  for (const f of geo.features) {
    const d = toPath(f, projection, { tolerance: 0.9, minArea: 3 });
    if (!d) continue;
    const share = shares.get(f.properties.iso3) || 0;
    countries.push({
      id: f.properties.iso3,
      name: f.properties.name,
      d,
      share: Number(share.toFixed(5)),
    });
  }
  countries.sort((a, b) => b.share - a.share);
  return { ...WORLD, countries, totalUsd: total, window };
}

// ------------------------------------------------------------- district map

/** Commodities worth showing at district resolution, in the order the selector lists them. */
const DISTRICT_COMMODITIES = [
  ['corn', 'Corn'],
  ['soybeans', 'Soybeans'],
  ['wheat', 'Wheat'],
  ['eggs', 'Eggs'],
  ['beef', 'Beef'],
  ['milk', 'Fluid milk'],
  ['citrus', 'Citrus'],
];

function buildDistricts() {
  const geo = read('apps/web/public/geo/cd119.geojson');
  const focus = read('packages/config/data/focus-districts.json');
  const projection = geoAlbersUsa().fitSize([US.width, US.height], geo);

  const districts = [];
  for (const f of geo.features) {
    const d = toPath(f, projection, { tolerance: 0.55, minArea: 0.8 });
    if (!d) continue;
    districts.push({ id: f.properties.id, name: f.properties.name, d });
  }

  const production = {};
  for (const [key, label] of DISTRICT_COMMODITIES) {
    const series = focus.production[key];
    if (!series) continue;
    // Store as parts per 100,000 to keep the file small and integer-clean.
    const shares = {};
    let max = 0;
    for (const [id, share] of Object.entries(series)) {
      const v = Math.round(share * 1e5);
      if (v > 0) shares[id] = v;
      if (share > max) max = share;
    }
    production[key] = { label, max: Number(max.toFixed(5)), shares };
  }

  return { ...US, districts, production, order: DISTRICT_COMMODITIES.map(([k]) => k), source: focus.source };
}

// ------------------------------------------------------------------- write

const world = buildWorld();
const districts = buildDistricts();

const out = `// Generated by apps/site/tools/build-graphics.mjs — do not edit by hand.
export const world = ${JSON.stringify(world)};
export const districts = ${JSON.stringify(districts)};
`;

const target = join(here, '..', 'assets', 'maps.js');
writeFileSync(target, out);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`world: ${world.countries.length} countries, top origin ${world.countries[0].id} ${(world.countries[0].share * 100).toFixed(1)}%`);
console.log(`districts: ${districts.districts.length} shapes, ${Object.keys(districts.production).length} commodities`);
console.log(`wrote ${target} (${kb(out.length)})`);
