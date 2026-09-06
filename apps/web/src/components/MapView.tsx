import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { EngineContext, AreaHeat } from '@surge/engine';
import { countryHeat, stateHeat, threatAffectsArea } from '@surge/engine';
import { type RankedEntry, focusView, focusAreas } from '../engine.js';
import type { Focus } from '../state.js';
import { compactUsd, pct } from '../format.js';
import { heatColor, NEUTRAL } from '../heat-colors.js';
import { HeatLegend } from './HeatLegend.js';

/**
 * Basemap: CARTO raster tiles (no fonts, sprites, or vector processing), so the map paints progressively within a
 * second or two even on slow connections or with blockers. Labels are a separate raster layer drawn above our shading.
 */
const SUBS = ['a', 'b', 'c'];
const tiles = (name: string) => SUBS.map((h) => `https://${h}.basemaps.cartocdn.com/${name}/{z}/{x}/{y}@2x.png`);
function rasterStyle(theme: 'dark' | 'light'): maplibregl.StyleSpecification {
  const base = theme === 'dark' ? 'dark_nolabels' : 'light_nolabels';
  const labels = theme === 'dark' ? 'dark_only_labels' : 'light_only_labels';
  return {
    version: 8,
    sources: {
      base: { type: 'raster', tiles: tiles(base), tileSize: 256, attribution: '© CARTO © OpenStreetMap contributors', maxzoom: 19 },
      labels: { type: 'raster', tiles: tiles(labels), tileSize: 256, maxzoom: 19 },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': theme === 'dark' ? '#0b0e14' : '#dfe6ee' } },
      { id: 'base', type: 'raster', source: 'base', paint: { 'raster-opacity': 1 } },
    ],
  };
}

interface Props {
  entries: RankedEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  theme: 'dark' | 'light';
  ctx: EngineContext;
  focus: Focus;
  onFail?: (why: string) => void;
}

type FC = GeoJSON.FeatureCollection;
const EMPTY: FC = { type: 'FeatureCollection', features: [] };
const geoCache: Record<string, Promise<FC>> = {};
function loadGeo(name: 'states' | 'cd119' | 'countries'): Promise<FC> {
  return (geoCache[name] ??= fetch(`/geo/${name}.geojson`).then((r): Promise<FC> => (r.ok ? (r.json() as Promise<FC>) : Promise.resolve(EMPTY))).catch((): FC => EMPTY));
}

function circle(lng: number, lat: number, km: number): GeoJSON.Polygon {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    pts.push([lng + (km / 111) * Math.cos(a) / Math.cos((lat * Math.PI) / 180), lat + (km / 111) * Math.sin(a)]);
  }
  return { type: 'Polygon', coordinates: [pts] };
}

const STATUS_LABEL: Record<AreaHeat['status'], string> = { none: 'no US food supply', stable: 'stable', anticipated: 'anticipated instability', unstable: 'unstable' };

export function MapView({ entries, selectedId, onSelect, theme, ctx, focus, onFail }: Props) {
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const themeInit = useRef(true);
  const ready = useRef(false);
  const popup = useRef<maplibregl.Popup | null>(null);
  const geos = useRef<{ countries: FC; states: FC } | null>(null);
  const focusRef = useRef(focus);
  focusRef.current = focus;

  /**
   * Recolor every area from the current threat list. With a state or district in focus, only threats
   * that reach that area count, green baseline is shown for the focus area alone, and everything
   * else stays neutral.
   */
  const paint = (map: maplibregl.Map) => {
    const g = geos.current;
    if (!g || !ready.current) return;
    const fo = focusRef.current;
    const areas = focusAreas(fo, ctx);
    const area = areas.length > 0 ? areas[0] : undefined; // "focused" flag
    const ownStates = new Set(areas.map((a) => a.state));
    // historical replays are cases to study, not current instability: they never color the map
    const all = entriesRef.current.filter((e) => e.origin !== 'replay').map((e) => e.threat);
    const threats = areas.length > 0 && ctx.focus ? all.filter((t) => areas.some((a) => threatAffectsArea(t, a, ctx.focus!))) : all;
    const ch = countryHeat(threats, ctx);
    const sh = stateHeat(threats, ctx);
    const nameOf = (id: string) => entriesRef.current.find((e) => e.threat.id === id)?.threat.name ?? id;
    const isFocusState = (id: string) => ownStates.has(id);
    const colorFor = (h: AreaHeat | undefined, own: boolean) => (area && !own && ((h?.status ?? 'stable') === 'stable' || h?.status === 'none') ? NEUTRAL : heatColor(h));
    const listOf = (h: AreaHeat | undefined) => { const t = (h?.threats ?? []).map(nameOf); return t.length > 5 ? [...t.slice(0, 5), `and ${t.length - 5} more`].join(' · ') : t.join(' · '); };
    const countries: FC = { type: 'FeatureCollection', features: g.countries.features.filter((f) => f.id !== 'USA').map((f) => {
      const iso = String(f.id);
      const h = ch[iso];
      return { ...f, properties: { ...f.properties, iso3: iso, color: colorFor(h, false), neutral: (!!area && (h?.status ?? 'stable') === 'stable') || (h?.status ?? 'none') === 'none', status: h?.status ?? 'none', intensity: h?.intensity ?? 0, share: h?.baseline ?? 0, top: h?.threats[0] ?? '', threats: listOf(h) } };
    }) };
    const states: FC = { type: 'FeatureCollection', features: g.states.features.map((f) => {
      const id = String(f.id);
      const h = sh[id];
      const own = isFocusState(id);
      return { ...f, properties: { ...f.properties, color: colorFor(h, own), neutral: (!!area && !own && (h?.status ?? 'stable') === 'stable') || h?.status === 'none', status: h?.status ?? 'stable', intensity: h?.intensity ?? 0, share: h?.baseline ?? 0, top: h?.threats[0] ?? '', threats: listOf(h) } };
    }) };
    // chokepoints: shaded straits, red when a transit threat is active, yellow when only reported
    const cps: GeoJSON.Feature[] = [];
    for (const [rid, r] of Object.entries(ctx.regions)) {
      if (!r.chokepointImportShare || Object.keys(r.chokepointImportShare).length === 0) continue;
      const here = entriesRef.current.filter((e) => e.origin !== 'replay' && e.threat.location.regionId === rid && threats.includes(e.threat));
      const active = here.filter((e) => e.threat.status !== 'breaking');
      const status: AreaHeat['status'] = active.length > 0 ? 'unstable' : here.length > 0 ? 'anticipated' : 'stable';
      const sev = Math.max(0, ...here.map((e) => e.threat.severity * (e.threat.status === 'breaking' ? (e.threat.confidence ?? 0.5) : 1)));
      const h: AreaHeat = { id: rid, status, intensity: status === 'stable' ? 0.35 : 0.25 + 0.75 * Math.min(1, sev), baseline: 0, disruption: 0, anticipated: 0, threats: [...active, ...here.filter((e) => e.threat.status === 'breaking')].map((e) => e.threat.id) };
      cps.push({ type: 'Feature', id: rid, geometry: circle(r.lng, r.lat, 220), properties: { name: r.name, color: area && status === 'stable' ? NEUTRAL : heatColor(h), neutral: !!area && status === 'stable', status, intensity: h.intensity, share: 0, top: h.threats[0] ?? '', threats: h.threats.map(nameOf).join(' · '), chokepoint: true } });
    }
    (map.getSource('countries') as maplibregl.GeoJSONSource).setData(countries);
    (map.getSource('states-heat') as maplibregl.GeoJSONSource).setData(states);
    (map.getSource('chokepoints') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: cps });
  };

  const addLayers = (map: maplibregl.Map) => {
    const opacity = theme === 'dark' ? 0.72 : 0.8;
    for (const id of ['countries', 'states-heat', 'chokepoints', 'focus', 'selected']) if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY });
    const firstSymbol = map.getLayer('labels') ? 'labels' : map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
    const op: maplibregl.ExpressionSpecification = ['case', ['boolean', ['get', 'neutral'], false], 0.18, opacity];
    if (!map.getLayer('countries-fill')) map.addLayer({ id: 'countries-fill', type: 'fill', source: 'countries', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': op } }, firstSymbol);
    if (!map.getLayer('countries-line')) map.addLayer({ id: 'countries-line', type: 'line', source: 'countries', paint: { 'line-color': theme === 'dark' ? '#0b0e14' : '#ffffff', 'line-width': 0.5, 'line-opacity': 0.7 } }, firstSymbol);
    if (!map.getLayer('states-fill')) map.addLayer({ id: 'states-fill', type: 'fill', source: 'states-heat', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': op } }, firstSymbol);
    if (!map.getLayer('states-line')) map.addLayer({ id: 'states-line', type: 'line', source: 'states-heat', paint: { 'line-color': theme === 'dark' ? '#0b0e14' : '#ffffff', 'line-width': 0.5, 'line-opacity': 0.7 } }, firstSymbol);
    if (!map.getLayer('chokepoints-fill')) map.addLayer({ id: 'chokepoints-fill', type: 'fill', source: 'chokepoints', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['boolean', ['get', 'neutral'], false], 0.2, 0.75] } }, firstSymbol);
    if (!map.getLayer('chokepoints-line')) map.addLayer({ id: 'chokepoints-line', type: 'line', source: 'chokepoints', paint: { 'line-color': ['get', 'color'], 'line-width': 1.5 } }, firstSymbol);
    if (!map.getLayer('focus-fill')) map.addLayer({ id: 'focus-fill', type: 'fill', source: 'focus', paint: { 'fill-color': '#4aa8ff', 'fill-opacity': 0.08 } });
    if (!map.getLayer('focus-line')) map.addLayer({ id: 'focus-line', type: 'line', source: 'focus', paint: { 'line-color': '#4aa8ff', 'line-width': 2 } });
    if (!map.getLayer('selected-line')) map.addLayer({ id: 'selected-line', type: 'line', source: 'selected', paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [2, 1] } });
    if (map.getSource('labels') && !map.getLayer('labels')) map.addLayer({ id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.9 } });
    ready.current = true;
    paint(map);
  };

  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({ container: container.current, style: rasterStyle(theme), center: [-30, 28], zoom: 1.6, attributionControl: { compact: true } });
    } catch (e) {
      onFailRef.current?.(`the map engine could not start (${(e as Error).message.slice(0, 60)})`);
      return;
    }
    // if the style never loads while the tab is visible, hand over to the SVG map
    const loadWatch = setTimeout(() => { if (!ready.current && document.visibilityState === 'visible') onFailRef.current?.('the map engine did not start in time'); }, 20000);
    const tryAdd = () => { if (!ready.current && map.isStyleLoaded()) { addLayers(map); map.resize(); clearTimeout(loadWatch); } };
    map.on('styledata', tryAdd);
    setTimeout(tryAdd, 300);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.keyboard.enable();
    map.getCanvas().setAttribute('tabindex', '0');
    map.on('mousedown', () => map.getCanvas().focus());
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __surgeMap?: maplibregl.Map }).__surgeMap = map;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);
    void Promise.all([loadGeo('countries'), loadGeo('states')]).then(([countries, states]) => { geos.current = { countries, states }; if (ready.current) paint(map); });
    map.on('load', () => { map.resize(); addLayers(map); });
    const note = () => container.current?.parentElement?.querySelector('.basemap-loading') as HTMLElement | null;
    map.once('load', () => setTimeout(() => note()?.remove(), 800));
    map.on('error', (e) => { const n = note(); const msg = String((e as { error?: Error }).error?.message ?? ''); if (n && /tile|source/i.test(msg)) { n.textContent = 'basemap tiles unavailable · data layers only'; setTimeout(() => n.remove(), 6000); } });
    setTimeout(() => note()?.remove(), 10000);
    map.on('style.load', () => { ready.current = false; addLayers(map); });
    const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: 'heat-pop' });
    popup.current = pop;
    const hoverLayers = ['chokepoints-fill', 'states-fill', 'countries-fill'];
    for (const layer of hoverLayers) {
      map.on('mousemove', layer, (ev) => {
        const f = ev.features?.[0];
        if (!f) return;
        const p = f.properties as { name?: string; status: AreaHeat['status']; share: number; threats: string; chokepoint?: boolean };
        map.getCanvas().style.cursor = p.threats ? 'pointer' : '';
        const share = Number(p.share);
        const isState = layer === 'states-fill';
        const why = p.status === 'none'
          ? 'No measurable food supply to the United States comes from here, and nothing is reported.'
          : p.chokepoint
          ? (p.status === 'stable' ? 'A shipping chokepoint for food imports. No transit disruption right now.' : p.status === 'anticipated' ? 'News reports point to a disruption of shipping here that is not yet in transit data.' : 'Ship transits here are down; imports that pass through are delayed or cut.')
          : p.status === 'stable'
            ? (isState ? `Produces about ${pct(share, 1)} of the food the US grows and raises. No current threat. Darker green means a bigger producer.` : `Supplies about ${pct(share, 1)} of the food the US imports. No current threat. Darker green means a bigger supplier.`)
            : p.status === 'anticipated'
              ? ''
              : `Supply from here is already being cut. Darker red means a bigger share of US ${isState ? 'production' : 'imports'} is affected.`;
        pop.setLngLat(ev.lngLat).setHTML(`<b>${p.name ?? ''}</b> <span class="st ${p.status}">${STATUS_LABEL[p.status]}</span>${why ? `<br><span class="why">${why}</span>` : ''}${p.threats ? `<br><span class="th">${p.status === 'anticipated' ? 'Reported: ' : ''}${p.threats}</span>` : ''}`).addTo(map);
      });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; pop.remove(); });
      map.on('click', layer, (ev) => {
        const f = ev.features?.[0];
        const top = (f?.properties as { top?: string } | undefined)?.top;
        if (top) onSelectRef.current(top);
      });
    }
    return () => { clearTimeout(loadWatch); ro.disconnect(); pop.remove(); map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (themeInit.current) { themeInit.current = false; return; }
    mapRef.current?.setStyle(rasterStyle(theme));
  }, [theme]);

  // recolor when the threat list or the focus changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const map = mapRef.current; if (map) paint(map); }, [entries, ctx, focus]);

  // selection: outline the selected threat's areas and slide toward it
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const e = entries.find((x) => x.threat.id === selectedId);
    const src = map.getSource('selected') as maplibregl.GeoJSONSource | undefined;
    if (!e || !src) { src?.setData(EMPTY); return; }
    const g = geos.current;
    const feats: GeoJSON.Feature[] = [];
    if (g) {
      const rid = e.threat.location.regionId;
      const region = rid ? ctx.regions[rid] : undefined;
      const isos = new Set<string>([...(region?.countries ?? []), ...(e.threat.location.iso3 && e.threat.location.iso3 !== 'USA' ? [e.threat.location.iso3] : [])]);
      for (const f of g.countries.features) if (isos.has(String(f.id))) feats.push(f);
      const states = rid ? ctx.focus?.regionStates[rid] : undefined;
      if (states && states.length > 0) for (const f of g.states.features) if (states.includes(String(f.id))) feats.push(f);
      if (region?.chokepointImportShare && Object.keys(region.chokepointImportShare).length > 0) feats.push({ type: 'Feature', geometry: circle(region.lng, region.lat, 220), properties: {} });
    }
    src.setData({ type: 'FeatureCollection', features: feats });
    const c = map.getCenter();
    const target = [e.threat.location.lng, e.threat.location.lat] as const;
    map.easeTo({ center: [c.lng + (target[0] - c.lng) * 0.45, c.lat + (target[1] - c.lat) * 0.45], duration: 550 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, entries]);

  // focus outline
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    const apply = async () => {
      const src = map.getSource('focus') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      if (focus.kind === 'us' || focus.ids.length === 0) { src.setData(EMPTY); return; }
      const fc = await loadGeo(focus.kind === 'state' ? 'states' : 'cd119');
      if (cancelled) return;
      const ids = new Set(focus.ids);
      const feats = fc.features.filter((x) => ids.has(String(x.id)) || ids.has(String((x.properties as { id?: string } | null)?.id)));
      src.setData({ type: 'FeatureCollection', features: feats });
      if (feats.length > 0) {
        const b = new maplibregl.LngLatBounds();
        const walk = (c: unknown): void => { if (!Array.isArray(c)) return; if (typeof c[0] === 'number') { b.extend(c as [number, number]); return; } for (const x of c) walk(x); };
        for (const f of feats) walk((f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
        map.fitBounds(b, { padding: 60, duration: 700, maxZoom: 6.5 });
      }
    };
    if (ready.current) void apply(); else map.once('load', () => { void apply(); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <div className="map-wrap">
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      <div className="basemap-loading">loading basemap…</div>
      <HeatLegend focused={focus.kind !== 'us' && focus.ids.length > 0} />
    </div>
  );
}
