import statesGeo from '../../../packages/config/data/states-geo.json' with { type: 'json' };

/**
 * Point-in-polygon against real state outlines (packages/config/data/states-geo.json, a copy of the web map's
 * Census cartographic boundaries), so a satellite hotspot in the Gulf of Mexico is not a Florida fire the way it
 * is inside Florida's bounding box. Ray casting, GeoJSON Polygon and MultiPolygon, holes respected.
 */
type Ring = number[][];
type PolygonCoords = Ring[];
type Geometry = { type: 'Polygon'; coordinates: PolygonCoords } | { type: 'MultiPolygon'; coordinates: PolygonCoords[] };
interface Feature { properties: { id: string; name?: string }; geometry: Geometry }
interface FC { features: Feature[] }

/** Even-odd ray cast: true when (lng, lat) is inside the ring (edge points count as inside on one side only). */
export function pointInRing(ring: Ring, lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!, yi = ring[i]![1]!;
    const xj = ring[j]![0]!, yj = ring[j]![1]!;
    const crosses = (yi > lat) !== (yj > lat);
    if (crosses && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
export function pointInPolygon(polygon: PolygonCoords, lng: number, lat: number): boolean {
  const [outer, ...holes] = polygon;
  if (!outer || !pointInRing(outer, lng, lat)) return false;
  return !holes.some((h) => pointInRing(h, lng, lat));
}

export function pointInGeometry(geometry: Geometry, lng: number, lat: number): boolean {
  if (geometry.type === 'Polygon') return pointInPolygon(geometry.coordinates, lng, lat);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((p) => pointInPolygon(p, lng, lat));
  return false;
}

interface Indexed { id: string; geometry: Geometry; bbox: [number, number, number, number] }

function bboxOf(g: Geometry): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const p of polys) for (const ring of p) for (const [x, y] of ring) {
    if (x! < minX) minX = x!; if (x! > maxX) maxX = x!; if (y! < minY) minY = y!; if (y! > maxY) maxY = y!;
  }
  return [minX, minY, maxX, maxY];
}

let index: Indexed[] | undefined;
function states(): Indexed[] {
  if (!index) index = (statesGeo as unknown as FC).features.map((f) => ({ id: f.properties.id, geometry: f.geometry, bbox: bboxOf(f.geometry) }));
  return index;
}

/** Two-letter id of the state (or territory) whose outline contains the point, or undefined (open water, abroad). */
export function stateAt(lng: number, lat: number): string | undefined {
  for (const s of states()) {
    const b = s.bbox;
    if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
    if (pointInGeometry(s.geometry, lng, lat)) return s.id;
  }
  return undefined;
}
