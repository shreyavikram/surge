import { useEffect, useMemo, useRef, useState } from 'react';
import { geoAlbersUsa, geoPath, geoArea } from 'd3-geo';
import type { EngineContext } from '@surge/engine';
import { type RankedEntry, perCapitaLossByArea, producerChangeByArea, focusView, focusAreas } from '../engine.js';
import type { Focus } from '../state.js';
import { compactUsd, usd2 } from '../format.js';
import { Info } from './Info.js';

type FC = GeoJSON.FeatureCollection;
const EMPTY: FC = { type: 'FeatureCollection', features: [] };
const cache: Record<string, Promise<FC>> = {};
function loadGeo(name: 'states' | 'cd119'): Promise<FC> {
  return (cache[name] ??= fetch(`/geo/${name}.geojson`).then((r): Promise<FC> => (r.ok ? (r.json() as Promise<FC>) : Promise.resolve(EMPTY))).catch((): FC => EMPTY));
}

const W = 400, H = 250;

/** d3-geo treats polygons as spherical and expects clockwise exterior rings; RFC 7946 files are counterclockwise. */
function rewind(fc: FC): FC {
  const fix = (ring: number[][]): number[][] => (geoArea({ type: 'Polygon', coordinates: [ring] }) > 2 * Math.PI ? ring.slice().reverse() : ring);
  return { type: 'FeatureCollection', features: fc.features.map((f) => {
    const g = f.geometry;
    if (g.type === 'Polygon') return { ...f, geometry: { type: 'Polygon', coordinates: g.coordinates.map((r, i) => (i === 0 ? fix(r as number[][]) : (r as number[][]))) as GeoJSON.Position[][] } };
    if (g.type === 'MultiPolygon') return { ...f, geometry: { type: 'MultiPolygon', coordinates: g.coordinates.map((poly) => poly.map((r, i) => (i === 0 ? fix(r as number[][]) : (r as number[][])))) as GeoJSON.Position[][][] } };
    return f;
  }) };
}

/** Continuous light → deep red between the lowest and highest per-capita loss on the map. */
function ramp(t: number): string {
  const stops = ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'];
  const k = Math.max(0, Math.min(0.9999, t)) * 4;
  const i = Math.floor(k), f = k - i;
  const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const a = hex(stops[i]!), b = hex(stops[i + 1]!);
  return `#${a.map((x, j) => Math.round(x + (b[j]! - x) * f).toString(16).padStart(2, '0')).join('')}`;
}

/** Diverging scale for producers: losses red, gains green, white at zero. */
function diverge(t: number): string {
  // t in [-1, 1]
  const k = Math.max(-1, Math.min(1, t));
  const mixc = (a: [number, number, number], b: [number, number, number], f: number) => `#${a.map((x, i) => Math.round(x + (b[i]! - x) * f).toString(16).padStart(2, '0')).join('')}`;
  const white: [number, number, number] = [245, 247, 250], red: [number, number, number] = [165, 15, 21], green: [number, number, number] = [11, 79, 48];
  return k < 0 ? mixc(white, red, -k) : mixc(white, green, k);
}

export function Distribution({ entry, ctx, focus }: { entry: RankedEntry; ctx: EngineContext; focus: Focus }) {
  const hasDistricts = (ctx.focus?.areas ?? []).some((a) => a.kind === 'district');
  const [level, setLevel] = useState<'state' | 'district'>(focus.kind === 'district' ? 'district' : 'state');
  const [horizon, setHorizon] = useState<'annual' | 'total'>('total');
  const [geo, setGeo] = useState<FC | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => { let on = true; void loadGeo(level === 'state' ? 'states' : 'cd119').then((g) => { if (on) setGeo(rewind(g)); }); return () => { on = false; }; }, [level]);

  const rows = useMemo(() => perCapitaLossByArea(entry.impact, ctx, level, horizon), [entry, ctx, level, horizon]);
  const prod = useMemo(() => producerChangeByArea(entry.impact, ctx, level), [entry, ctx, level]);
  const byId = useMemo(() => Object.fromEntries(rows.map((r) => [r.areaId, r])), [rows]);
  const prodById = useMemo(() => Object.fromEntries(prod.map((r) => [r.areaId, horizon === 'annual' ? r.annual : r.total])), [prod, horizon]);
  const vals = rows.map((r) => r.perCapita).filter((v) => v > 0);
  const max = Math.max(1e-9, ...vals);
  const min = vals.length ? Math.min(...vals) : 0;
  const scale = (v: number) => (max > min ? (v - min) / (max - min) : 0.5);
  const pvals = Object.values(prodById) as number[];
  const pmax = Math.max(1e-9, ...pvals.map((v) => Math.abs(v)));
  const path = useMemo(() => {
    const proj = geoAlbersUsa();
    if (geo && geo.features.length > 0) proj.fitSize([W, H], geo as never);
    return geoPath(proj);
  }, [geo]);
  const v = focusView(entry, focus, ctx);
  const fAreas = focusAreas(focus, ctx);
  const focusIds = new Set(fAreas.map((a) => a.id));
  const focusStates = new Set(fAreas.map((a) => a.state));
  const hovered = hover ? byId[hover] : undefined;
  const hoverArea = hover && ctx.focus ? ctx.focus.areas.find((a) => a.id === hover) : undefined;

  const [hoverWho, setHoverWho] = useState<'consumers' | 'producers'>('consumers');
  const [zoom, setZoom] = useState({ k: 1, cx: W / 2, cy: H / 2 });
  const zoomBy = (f: number) => setZoom((z) => { const k = Math.max(1, Math.min(8, z.k * f)); return k === 1 ? { k: 1, cx: W / 2, cy: H / 2 } : { ...z, k }; });
  const vb = `${zoom.cx - W / (2 * zoom.k)} ${zoom.cy - H / (2 * zoom.k)} ${W / zoom.k} ${H / zoom.k}`;
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const renderMap = (who: 'consumers' | 'producers') => (
    <div className="section" key={who}>
      <h4>Where the {who === 'consumers' ? 'consumer loss' : 'producer gain or loss'} lands<Info term={who === 'consumers' ? 'perCapita' : 'producer'} /></h4>
      <div className="usmap-wrap">
        <div className="svg-zoom mini"><button onClick={() => zoomBy(1.5)} title="Zoom in">+</button><button onClick={() => zoomBy(1 / 1.5)} title="Zoom out">−</button></div>
        <svg viewBox={vb} className="usmap" style={{ width: '100%', height: 'auto', display: 'block', cursor: 'grab' }}
          onWheel={(e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2); }}
          onMouseDown={(e) => { dragRef.current = { x: e.clientX, y: e.clientY, cx: zoom.cx, cy: zoom.cy }; }}
          onMouseMove={(e) => { const d = dragRef.current; if (!d) return; const el = e.currentTarget; const sc = (W / zoom.k) / el.clientWidth; setZoom((z) => ({ ...z, cx: d.cx - (e.clientX - d.x) * sc, cy: d.cy - (e.clientY - d.y) * sc })); }}
          onMouseUp={() => { dragRef.current = null; }} onMouseLeave={() => { dragRef.current = null; }}>
          {geo?.features.map((f) => {
            const id = (f.id as string | undefined) ?? (f.properties as { id?: string } | null)?.id ?? '';
            const r = byId[id];
            const t = r ? scale(r.perCapita) : 0;
            const pv = prodById[id];
            const fill = who === 'producers' ? (pv === undefined ? 'var(--panel-3)' : diverge(pv / pmax)) : (r ? ramp(t) : 'var(--panel-3)');
            const isFocus = focusIds.has(id) || (focus.kind === 'state' && level === 'district' && focusStates.has(id.split('-')[0]!));
            return <path key={id} d={path(f as never) ?? undefined} fill={fill} stroke={isFocus ? 'var(--accent)' : 'var(--bg)'} strokeWidth={isFocus ? 1.5 : 0.4} onMouseEnter={() => { setHover(id); setHoverWho(who); }} onMouseLeave={() => setHover(null)} />;
          })}
        </svg>
        {who === 'consumers' ? (
          <div className="usmap-legend">
            <span>{usd2(min)}</span>
            <span className="ramp" style={{ background: `linear-gradient(90deg, ${ramp(0)}, ${ramp(0.25)}, ${ramp(0.5)}, ${ramp(0.75)}, ${ramp(0.99)})` }} />
            <span>{usd2(max)} per person · {horizon === 'annual' ? 'first 12 months' : `total over ${entry.impact.durationMonths} months`}</span>
          </div>
        ) : (
          <div className="usmap-legend">
            <span>−{compactUsd(pmax)}</span>
            <span className="ramp" style={{ background: `linear-gradient(90deg, ${diverge(-1)}, ${diverge(0)}, ${diverge(1)})` }} />
            <span>+{compactUsd(pmax)} producer revenue · {horizon === 'annual' ? 'first 12 months' : `total over ${entry.impact.durationMonths} months`}</span>
          </div>
        )}
        <div className="usmap-hover">
          {hovered && hoverArea && hoverWho === who
            ? (who === 'consumers'
              ? <><b>{hoverArea.name}</b> · {usd2(hovered.perCapita)} per person · {compactUsd(hovered.cv)} in total</>
              : <><b>{hoverArea.name}</b> · producers {(prodById[hover!] ?? 0) >= 0 ? 'gain' : 'lose'} {compactUsd(Math.abs(prodById[hover!] ?? 0))}</>)
            : <span className="faint">hover an area · focus: {v.label}</span>}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="section" style={{ paddingBottom: 0 }}>
        <div className="dist-controls">
          <span className="seg small">
            <button className={horizon === 'annual' ? 'on' : ''} onClick={() => setHorizon('annual')}>Annual</button>
            <button className={horizon === 'total' ? 'on' : ''} onClick={() => setHorizon('total')}>Total · {entry.impact.durationMonths} mo</button>
          </span>
          {hasDistricts && (
            <span className="seg small">
              <button className={level === 'state' ? 'on' : ''} onClick={() => setLevel('state')}>States</button>
              <button className={level === 'district' ? 'on' : ''} onClick={() => setLevel('district')}>Districts</button>
            </span>
          )}
        </div>
      </div>
      {renderMap('consumers')}
      {renderMap('producers')}

      <div className="section">
        <h4>Cost per household by income group<Info term="quintile" /></h4>
        <div className="bars">
          {entry.impact.welfare.incidence.map((q) => {
            const scale = entry.impact.welfare.cv > 0 ? v.cv / entry.impact.welfare.cv : 0;
            const all = entry.impact.welfare.incidence.map((x) => x.lossPerHousehold);
            const mx = Math.max(...all, 1e-9);
            const val = q.lossPerHousehold * (focus.kind === 'us' ? 1 : Math.min(1, scale * (ctx.population.value / Math.max(1, v.population))));
            return (
              <div className="qbar-row" key={q.quintile}>
                <span className="qbar-lbl">{q.quintile === 1 ? 'Q1 · lowest income' : q.quintile === 5 ? 'Q5 · highest income' : `Q${q.quintile}`}</span>
                <span className="qbar-track"><span className="qbar-fill" style={{ width: `${Math.max(4, (q.lossPerHousehold / mx) * 100)}%` }}><span className="qbar-val">{usd2(val)}</span></span></span>
              </div>
            );
          })}
        </div>
        <div className="subfig">based on what households in each income group spend on the hardest-hit item (Consumer Expenditure Survey)</div>
      </div>
    </>
  );
}
