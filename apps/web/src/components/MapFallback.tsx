import { useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath, geoArea } from 'd3-geo';
import type { EngineContext, AreaHeat } from '@surge/engine';
import { countryHeat, stateHeat, threatAffectsArea } from '@surge/engine';
import { type RankedEntry, focusView, focusAreas } from '../engine.js';
import type { Focus } from '../state.js';
import { heatColor, NEUTRAL } from '../heat-colors.js';
import { HeatLegend } from './HeatLegend.js';
import { compactUsd } from '../format.js';

/** SVG world heatmap used when WebGL is unavailable or the tile map fails: same colors, no tiles, no WebGL. */
type FC = GeoJSON.FeatureCollection;
const EMPTY: FC = { type: 'FeatureCollection', features: [] };
const cache: Record<string, Promise<FC>> = {};
function loadGeo(name: 'states' | 'countries'): Promise<FC> {
  return (cache[name] ??= fetch(`/geo/${name}.geojson`).then((r): Promise<FC> => (r.ok ? (r.json() as Promise<FC>) : Promise.resolve(EMPTY))).catch((): FC => EMPTY));
}
function rewind(fc: FC): FC {
  const fix = (ring: number[][]): number[][] => (geoArea({ type: 'Polygon', coordinates: [ring] }) > 2 * Math.PI ? ring.slice().reverse() : ring);
  return { type: 'FeatureCollection', features: fc.features.map((f) => {
    const g = f.geometry;
    if (g.type === 'Polygon') return { ...f, geometry: { type: 'Polygon', coordinates: g.coordinates.map((r, i) => (i === 0 ? fix(r as number[][]) : (r as number[][]))) as GeoJSON.Position[][] } };
    if (g.type === 'MultiPolygon') return { ...f, geometry: { type: 'MultiPolygon', coordinates: g.coordinates.map((poly) => poly.map((r, i) => (i === 0 ? fix(r as number[][]) : (r as number[][])))) as GeoJSON.Position[][][] } };
    return f;
  }) };
}

/** The panel's own size drives the projection so the world fills it edge to edge. */
const WORLD: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[-180, -60], [180, -60], [180, 84], [-180, 84], [-180, -60]]] };

interface Props { entries: RankedEntry[]; selectedId: string | null; onSelect: (id: string) => void; ctx: EngineContext; focus: Focus; reason: string }

export function MapFallback({ entries, selectedId, onSelect, ctx, focus, reason }: Props) {
  const [countries, setCountries] = useState<FC | null>(null);
  const [states, setStates] = useState<FC | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => { let on = true; void Promise.all([loadGeo('countries'), loadGeo('states')]).then(([c, s]) => { if (on) { setCountries(rewind(c)); setStates(rewind(s)); } }); return () => { on = false; }; }, []);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 960, h: 600 });
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) }); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const W = size.w, H = size.h;
  const proj = useMemo(() => geoMercator().fitSize([W, H], WORLD as never), [W, H]);
  const path = useMemo(() => geoPath(proj), [proj]);
  // view: scale and center in SVG units; the whole world fills the panel at k = 1
  const [view, setView] = useState({ k: 1, cx: W / 2, cy: H / 2 });
  useEffect(() => { setView((v) => (v.k === 1 ? { k: 1, cx: W / 2, cy: H / 2 } : v)); }, [W, H]);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const vb = `${view.cx - W / (2 * view.k)} ${view.cy - H / (2 * view.k)} ${W / view.k} ${H / view.k}`;
  const zoomBy = (f: number) => setView((v) => ({ ...v, k: Math.max(1, Math.min(8, v.k * f)) }));
  const onDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }; };
  const onMove = (e: React.MouseEvent) => { const d = drag.current; if (!d) return; const el = e.currentTarget as SVGSVGElement; const s = (W / view.k) / el.clientWidth; setView((v) => ({ ...v, cx: d.cx - (e.clientX - d.x) * s, cy: d.cy - (e.clientY - d.y) * s })); };
  const onUp = () => { drag.current = null; };
  const onKey = (e: React.KeyboardEvent) => {
    const step = (W / view.k) * 0.08;
    if (e.key === '+' || e.key === '=') { zoomBy(1.4); e.preventDefault(); }
    else if (e.key === '-' || e.key === '_') { zoomBy(1 / 1.4); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { setView((v) => ({ ...v, cx: v.cx - step })); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { setView((v) => ({ ...v, cx: v.cx + step })); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setView((v) => ({ ...v, cy: v.cy - step })); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { setView((v) => ({ ...v, cy: v.cy + step })); e.preventDefault(); }
  };
  const areas = focusAreas(focus, ctx);
  const live = entries.filter((e) => e.origin !== 'replay').map((e) => e.threat);
  const threats = areas.length > 0 && ctx.focus ? live.filter((t) => areas.some((a) => threatAffectsArea(t, a, ctx.focus!))) : live;
  const ch = useMemo(() => countryHeat(threats, ctx), [threats, ctx]);
  const sh = useMemo(() => stateHeat(threats, ctx), [threats, ctx]);
  const ownStates = new Set(areas.map((a) => a.state));
  const colorFor = (h: AreaHeat | undefined, own: boolean) => (areas.length > 0 && !own && ((h?.status ?? 'stable') === 'stable' || h?.status === 'none') ? NEUTRAL : heatColor(h));
  const nameOf = (id: string) => entries.find((e) => e.threat.id === id)?.threat.name ?? id;
  const sel = entries.find((e) => e.threat.id === selectedId);
  const v = sel ? focusView(sel, focus, ctx) : null;
  const hoverHeat = hover ? (ch[hover] ?? sh[hover]) : undefined;
  return (
    <div className="map-wrap fallback" ref={wrapRef}>
      <svg viewBox={vb} className="worldmap" tabIndex={0} aria-label="World map; use plus and minus to zoom, arrow keys to pan" style={{ width: '100%', height: '100%', display: 'block', outline: 'none', cursor: drag.current ? 'grabbing' : 'grab' }}
        onMouseDown={(e) => { onDown(e); (e.currentTarget as SVGSVGElement).focus(); }} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15)} onKeyDown={onKey}>
        <path d={path({ type: 'Sphere' } as never) ?? undefined} fill="var(--bg)" />
        {countries?.features.filter((f) => f.id !== 'USA').map((f) => {
          const iso = String(f.id); const h = ch[iso];
          return <path key={iso} d={path(f as never) ?? undefined} fill={colorFor(h, false)} fillOpacity={(areas.length > 0 && (h?.status ?? 'stable') === 'stable') || (h?.status ?? 'none') === 'none' ? 0.3 : 0.85} stroke="var(--bg)" strokeWidth={0.4}
            onMouseEnter={() => setHover(iso)} onMouseLeave={() => setHover(null)} onClick={() => { const t = h?.threats[0]; if (t) onSelect(t); }} style={{ cursor: h?.threats.length ? 'pointer' : 'default' }} />;
        })}
        {states?.features.map((f) => {
          const id = String(f.id); const h = sh[id]; const own = ownStates.has(id);
          return <path key={id} d={path(f as never) ?? undefined} fill={colorFor(h, own)} fillOpacity={areas.length > 0 && !own && (h?.status ?? 'stable') === 'stable' ? 0.25 : 0.85} stroke={own ? 'var(--accent)' : 'var(--bg)'} strokeWidth={own ? 1.2 : 0.4}
            onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)} onClick={() => { const t = h?.threats[0]; if (t) onSelect(t); }} style={{ cursor: h?.threats.length ? 'pointer' : 'default' }} />;
        })}
      </svg>
      <div className="svg-zoom"><button onClick={() => zoomBy(1.4)} title="Zoom in (+)">+</button><button onClick={() => zoomBy(1 / 1.4)} title="Zoom out (−)">−</button></div>
      <div className="svg-hint">+ / − to zoom · arrows or drag to pan</div>
      <div className="map-badge">{sel && v ? `${sel.threat.name} · ${compactUsd(v.cv)}` : `simplified map · ${reason}`}</div>
      {hover && (
        <div className="map-hover">
          <b>{(countries?.features.find((f) => String(f.id) === hover)?.properties as { name?: string } | null)?.name ?? ctx.focus?.areas.find((a) => a.id === hover)?.name ?? hover}</b>
          {(hoverHeat ?? { status: 'none' as const, baseline: 0, threats: [] }) && (() => {
            const hh = hoverHeat ?? { status: 'none' as const, baseline: 0, threats: [] as string[] };
            const isState = !!sh[hover];
            const share = `${(hh.baseline * 100).toFixed(1)}%`;
            const why = hh.status === 'none'
              ? 'No measurable food supply to the United States comes from here, and nothing is reported.'
              : hh.status === 'stable'
              ? (isState ? `Produces about ${share} of the food the US grows and raises. No current threat. Darker green means a bigger producer.` : `Supplies about ${share} of the food the US imports. No current threat. Darker green means a bigger supplier.`)
              : hh.status === 'anticipated'
                ? 'News reports point to a coming supply problem here that has not yet shown up in shipping, supply, or price data.'
                : `Supply from here is already being cut. Darker red means a bigger share of US ${isState ? 'production' : 'imports'} is affected.`;
            const names = hh.threats.map(nameOf);
            const list = names.length > 5 ? [...names.slice(0, 5), `and ${names.length - 5} more`] : names;
            return <><br /><span className="why">{why}</span>{list.length ? <><br /><span className="faint">{list.join(' · ')}</span></> : null}</>;
          })()}
        </div>
      )}
      <HeatLegend focused={focus.kind !== 'us' && focus.ids.length > 0} />
    </div>
  );
}
