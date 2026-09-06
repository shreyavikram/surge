import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { EngineContext } from '@surge/engine';
import { type RankedEntry, categoryColor, focusView } from '../engine.js';
import type { Focus } from '../state.js';
import { compactUsd } from '../format.js';
import { CategoryLegend } from './CategoryLegend.js';

const STYLE: Record<'dark' | 'light', string> = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/liberty',
};
const SHADE_ZOOM = 4; // at or above this zoom, dots give way to region shading

function radius(cv: number): number {
  const r = 4 + 2.2 * Math.log10(Math.max(1, cv / 1e6));
  return Math.max(5, Math.min(13, r));
}

interface Props {
  entries: RankedEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  theme: 'dark' | 'light';
  ctx: EngineContext;
  focus: Focus;
  readIds: Set<string>;
}

type FC = GeoJSON.FeatureCollection;
const EMPTY: FC = { type: 'FeatureCollection', features: [] };
const geoCache: Record<string, Promise<FC>> = {};
function loadGeo(name: 'states' | 'cd119'): Promise<FC> {
  return (geoCache[name] ??= fetch(`/geo/${name}.geojson`).then((r): Promise<FC> => (r.ok ? (r.json() as Promise<FC>) : Promise.resolve(EMPTY))).catch((): FC => EMPTY));
}

function bboxPolygon(b: [number, number, number, number]): GeoJSON.Polygon {
  const [w, s, e, n] = b;
  return { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
}

export function MapView({ entries, selectedId, onSelect, theme, ctx, focus, readIds }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<{ marker: maplibregl.Marker; el: HTMLDivElement }[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const themeInit = useRef(true);
  const styleReady = useRef(false);

  // region shading source: one polygon per production region that carries a threat
  const regionFC = (): FC => {
    const byRegion = new Map<string, { sev: number; color: string; name: string; id: string }>();
    for (const e of entries) {
      const rid = e.threat.location.regionId;
      const r = rid ? ctx.regions[rid] : undefined;
      if (!rid || !r || rid === 'us-national') continue;
      const cur = byRegion.get(rid);
      if (!cur || e.threat.severity > cur.sev) byRegion.set(rid, { sev: e.threat.severity, color: categoryColor(e.threat.category), name: r.name, id: e.threat.id });
    }
    return {
      type: 'FeatureCollection',
      features: [...byRegion.entries()].map(([rid, v]) => ({ type: 'Feature', id: rid, geometry: bboxPolygon(ctx.regions[rid]!.bbox), properties: { color: v.color, opacity: 0.12 + 0.4 * Math.min(1, v.sev), name: v.name, threatId: v.id } })),
    };
  };

  const addLayers = (map: maplibregl.Map) => {
    if (!map.getSource('regions')) map.addSource('regions', { type: 'geojson', data: regionFC() });
    if (!map.getLayer('regions-fill')) map.addLayer({ id: 'regions-fill', type: 'fill', source: 'regions', minzoom: SHADE_ZOOM, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'] } });
    if (!map.getLayer('regions-line')) map.addLayer({ id: 'regions-line', type: 'line', source: 'regions', minzoom: SHADE_ZOOM, paint: { 'line-color': ['get', 'color'], 'line-width': 1.2, 'line-opacity': 0.8 } });
    if (!map.getSource('focus')) map.addSource('focus', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    if (!map.getLayer('focus-line')) map.addLayer({ id: 'focus-line', type: 'line', source: 'focus', paint: { 'line-color': '#4aa8ff', 'line-width': 2 } });
    if (!map.getLayer('focus-fill')) map.addLayer({ id: 'focus-fill', type: 'fill', source: 'focus', paint: { 'fill-color': '#4aa8ff', 'fill-opacity': 0.06 } }, 'focus-line');
    styleReady.current = true;
  };

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({ container: container.current, style: STYLE[theme], center: [-30, 28], zoom: 1.6, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);
    map.on('load', () => { map.resize(); addLayers(map); });
    map.on('style.load', () => { styleReady.current = false; addLayers(map); });
    map.on('click', 'regions-fill', (ev) => {
      const f = ev.features?.[0];
      const id = f?.properties?.['threatId'] as string | undefined;
      if (id) onSelectRef.current(id);
    });
    map.on('mouseenter', 'regions-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'regions-fill', () => { map.getCanvas().style.cursor = ''; });
    const toggleDots = () => { const hide = map.getZoom() >= SHADE_ZOOM; for (const m of markers.current) m.el.style.display = hide ? 'none' : ''; };
    map.on('zoom', toggleDots);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (themeInit.current) { themeInit.current = false; return; }
    mapRef.current?.setStyle(STYLE[theme]);
  }, [theme]);

  // markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((m) => m.marker.remove());
    markers.current = [];
    const hide = map.getZoom() >= SHADE_ZOOM;
    for (const e of entries) {
      const v = focusView(e, focus, ctx);
      const el = document.createElement('div');
      const cls = ['marker'];
      if (selectedId === e.threat.id) cls.push('sel');
      if (e.threat.status === 'breaking') cls.push('breaking');
      if (!v.affects) cls.push('dim');
      el.className = cls.join(' ');
      const d = radius(v.cv) * 2;
      el.style.width = `${d}px`; el.style.height = `${d}px`;
      el.style.setProperty('--c', categoryColor(e.threat.category));
      el.title = `${e.threat.name} — ${compactUsd(v.cv)}`;
      if (!readIds.has(e.threat.id)) { const b = document.createElement('span'); b.className = 'badge'; el.appendChild(b); }
      if (hide) el.style.display = 'none';
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onSelectRef.current(e.threat.id);
        // slide the map part of the way toward the dot, no zoom change
        const c = map.getCenter();
        const target: [number, number] = [e.threat.location.lng, e.threat.location.lat];
        map.easeTo({ center: [c.lng + (target[0] - c.lng) * 0.45, c.lat + (target[1] - c.lat) * 0.45], duration: 550 });
      });
      const marker = new maplibregl.Marker({ element: el }).setLngLat([e.threat.location.lng, e.threat.location.lat]).addTo(map);
      markers.current.push({ marker, el });
    }
    if (styleReady.current) (map.getSource('regions') as maplibregl.GeoJSONSource | undefined)?.setData(regionFC());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, selectedId, focus, readIds, ctx]);

  // focus outline
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    const apply = async () => {
      const src = map.getSource('focus') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      if (focus.kind === 'us' || !focus.id) { src.setData({ type: 'FeatureCollection', features: [] }); return; }
      const fc = await loadGeo(focus.kind === 'state' ? 'states' : 'cd119');
      if (cancelled) return;
      const f = fc.features.find((x) => x.id === focus.id || (x.properties as { id?: string } | null)?.id === focus.id);
      src.setData({ type: 'FeatureCollection', features: f ? [f] : [] });
      if (f) {
        const b = new maplibregl.LngLatBounds();
        const walk = (c: unknown): void => {
          if (!Array.isArray(c)) return;
          if (typeof c[0] === 'number') { b.extend(c as [number, number]); return; }
          for (const x of c) walk(x);
        };
        walk((f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
        map.fitBounds(b, { padding: 60, duration: 700, maxZoom: 6.5 });
      }
    };
    if (styleReady.current) void apply(); else map.once('load', () => { void apply(); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <div className="map-wrap">
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      <CategoryLegend />
    </div>
  );
}
