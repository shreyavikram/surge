import { useEffect, useMemo, useState } from 'react';
import { geoAlbersUsa, geoPath, geoArea } from 'd3-geo';
import type { EngineContext } from '@surge/engine';
import { type RankedEntry, perCapitaLossByArea, focusView, focusAreas } from '../engine.js';
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

export function Distribution({ entry, ctx, focus }: { entry: RankedEntry; ctx: EngineContext; focus: Focus }) {
  const hasDistricts = (ctx.focus?.areas ?? []).some((a) => a.kind === 'district');
  const [level, setLevel] = useState<'state' | 'district'>(focus.kind === 'district' ? 'district' : 'state');
  const [geo, setGeo] = useState<FC | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => { let on = true; void loadGeo(level === 'state' ? 'states' : 'cd119').then((g) => { if (on) setGeo(rewind(g)); }); return () => { on = false; }; }, [level]);

  const rows = useMemo(() => perCapitaLossByArea(entry.impact, ctx, level), [entry, ctx, level]);
  const byId = useMemo(() => Object.fromEntries(rows.map((r) => [r.areaId, r])), [rows]);
  const vals = rows.map((r) => r.perCapita).filter((v) => v > 0);
  const max = Math.max(1e-9, ...vals);
  const min = vals.length ? Math.min(...vals) : 0;
  const scale = (v: number) => (max > min ? (v - min) / (max - min) : 0.5);
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

  return (
    <>
      <div className="section">
        <h4>Where the consumer loss lands<Info term="perCapita" />
          {hasDistricts && (
            <span className="seg small" style={{ marginLeft: 8 }}>
              <button className={level === 'state' ? 'on' : ''} onClick={() => setLevel('state')}>States</button>
              <button className={level === 'district' ? 'on' : ''} onClick={() => setLevel('district')}>Districts</button>
            </span>
          )}
        </h4>
        <div className="usmap-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} className="usmap" style={{ width: '100%', height: 'auto', display: 'block' }}>
            {geo?.features.map((f) => {
              const id = (f.id as string | undefined) ?? (f.properties as { id?: string } | null)?.id ?? '';
              const r = byId[id];
              const t = r ? scale(r.perCapita) : 0;
              const isFocus = focusIds.has(id) || (focus.kind === 'state' && level === 'district' && focusStates.has(id.split('-')[0]!));
              return <path key={id} d={path(f as never) ?? undefined} fill={r ? ramp(t) : 'var(--panel-3)'} stroke={isFocus ? 'var(--accent)' : 'var(--bg)'} strokeWidth={isFocus ? 1.5 : 0.4} onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)} />;
            })}
          </svg>
          <div className="usmap-legend">
            <span>{usd2(min)}</span>
            <span className="ramp" style={{ background: `linear-gradient(90deg, ${ramp(0)}, ${ramp(0.25)}, ${ramp(0.5)}, ${ramp(0.75)}, ${ramp(0.99)})` }} />
            <span>{usd2(max)} / person</span>
          </div>
          <div className="usmap-hover">
            {hovered && hoverArea ? <><b>{hoverArea.name}</b> · {usd2(hovered.perCapita)} per person · {compactUsd(hovered.cv)} total</> : <span className="faint">hover an area · focus: {v.label}</span>}
          </div>
        </div>
      </div>

      <div className="section">
        <h4>Loss per household by income quintile<Info term="quintile" /></h4>
        <div className="bars">
          {entry.impact.welfare.incidence.map((q) => {
            const scale = entry.impact.welfare.cv > 0 ? v.cv / entry.impact.welfare.cv : 0;
            const all = entry.impact.welfare.incidence.map((x) => x.lossPerHousehold);
            const mx = Math.max(...all, 1e-9);
            return (
              <div className="bar-row" key={q.quintile}>
                <span className="faint">Q{q.quintile}</span>
                <span className="bar-track"><span className="bar-fill" style={{ width: `${(q.lossPerHousehold / mx) * 100}%` }} /></span>
                <span>{usd2(q.lossPerHousehold * (focus.kind === 'us' ? 1 : Math.min(1, scale * (ctx.population.value / Math.max(1, v.population)))))}</span>
              </div>
            );
          })}
        </div>
        <div className="subfig">household spending on the worst-hit commodity by income fifth (CEX)</div>
      </div>
    </>
  );
}
