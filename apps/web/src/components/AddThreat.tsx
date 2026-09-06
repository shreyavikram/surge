import { useMemo, useState } from 'react';
import type { EngineContext, ThreatCategory } from '@surge/engine';
import { candidateToThreat, commodityName, CATEGORY_LABEL, type Threat, type ThreatCandidate } from '../engine.js';
import { pct } from '../format.js';
import { Describe } from './Describe.js';
import { Info } from './Info.js';

/** Commodities a place matters for: what it produces (domestic) or sends to the US (supplier), at a sensible floor. */
export function placeCommodities(ctx: EngineContext, regionId: string): string[] {
  const r = ctx.regions[regionId];
  if (!r) return [];
  const out: string[] = [];
  const isDomestic = (r.countries?.length ?? 0) === 0;
  for (const [id, v] of Object.entries(r.usSupplyShare ?? {})) {
    const m = ctx.commodities[id]?.supply.model;
    if (isDomestic && (m === 'manufacturing' || m === 'import')) continue;
    if (v >= 0.002 && (ctx.commodities[id] || ctx.inputs[id])) out.push(id);
  }
  for (const [id, v] of Object.entries(r.usImportOriginShare ?? {})) if (v >= 0.02 && (ctx.commodities[id] || ctx.inputs[id]) && !out.includes(id)) out.push(id);
  for (const id of [...Object.keys(r.worldExportShare ?? {}), ...Object.keys(r.chokepointImportShare ?? {})]) if ((ctx.commodities[id] || ctx.inputs[id]) && !out.includes(id)) out.push(id);
  return out;
}

const HIDDEN: ThreatCategory[] = ['import_dependence'];

/**
 * First thing in a scenario's toolbar: add a threat by describing it (the interpreter proposes the details) or by
 * filling in the fields yourself. Everything added is a hypothetical the dials can change later.
 */
export function AddThreat({ ctx, onAdd }: { ctx: EngineContext; onAdd: (t: Threat) => void }) {
  const [mode, setMode] = useState<'describe' | 'manual'>('describe');
  const categories = (Object.keys(ctx.threatTypes) as ThreatCategory[]).filter((c) => !HIDDEN.includes(c));
  const [category, setCategory] = useState<ThreatCategory>('drought');
  const places = useMemo(() => {
    const all = Object.values(ctx.regions);
    const states = all.filter((r) => r.id.startsWith('us-state-')).sort((a, b) => a.name.localeCompare(b.name));
    const usRegions = all.filter((r) => r.id.startsWith('us-') && !r.id.startsWith('us-state-'));
    const suppliers = all.filter((r) => (r.countries?.length ?? 0) === 1).sort((a, b) => a.name.localeCompare(b.name));
    const straits = all.filter((r) => r.chokepointImportShare && Object.keys(r.chokepointImportShare).length > 0 && (r.countries?.length ?? 0) === 0 && !r.id.startsWith('us-'));
    return { states, usRegions, suppliers, straits };
  }, [ctx]);
  const [regionId, setRegionId] = useState<string>('mexico');
  const options = useMemo(() => placeCommodities(ctx, regionId), [ctx, regionId]);
  const [picked, setPicked] = useState<Set<string> | null>(null); // null = everything the place matters for
  const [severity, setSeverity] = useState(0.3);
  const [months, setMonths] = useState(6);
  const [start, setStart] = useState(new Date().toISOString().slice(0, 7));
  const chosen = picked ? options.filter((id) => picked.has(id)) : options;
  const isTariff = category === 'tariff';
  const region = ctx.regions[regionId];
  const add = () => {
    if (!region || chosen.length === 0) return;
    const c: ThreatCandidate = {
      name: `${CATEGORY_LABEL[category]} — ${region.name}`, category, regionId, commodities: chosen.map((id) => ({ id, relevance: 1 })),
      severity, months, confidence: 1, matched: ['entered by hand'], source: 'rule-based',
    };
    onAdd(candidateToThreat(c, ctx, `user-${Date.now()}`, start));
    setPicked(null);
  };
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p ?? options); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="add-threat">
      <div className="at-head">Add a hypothetical threat<Info term="hypothetical" /></div>
      <div className="seg small">
        <button className={mode === 'describe' ? 'on' : ''} onClick={() => setMode('describe')}>Describe it</button>
        <button className={mode === 'manual' ? 'on' : ''} onClick={() => setMode('manual')}>Fill it in</button>
      </div>
      {mode === 'describe' ? (
        <Describe ctx={ctx} onAdd={onAdd} />
      ) : (
        <div className="at-form">
          <label className="field"><span>Threat type</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as ThreatCategory)}>
              {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </label>
          <label className="field"><span>Where</span>
            <select value={regionId} onChange={(e) => { setRegionId(e.target.value); setPicked(null); }}>
              <optgroup label="Supplier countries">{places.suppliers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
              <optgroup label="Shipping straits">{places.straits.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
              <optgroup label="US regions">{places.usRegions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
              <optgroup label="US states">{places.states.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
            </select>
          </label>
          <div className="field"><span>Commodities {region ? `(${region.name} matters for ${options.length})` : ''}</span>
            {options.length === 0 ? <div className="faint">This place supplies nothing the model tracks.</div> : (
              <div className="at-comms">
                {options.map((id) => (
                  <label key={id} className={`pill small ${chosen.includes(id) ? 'on' : ''}`}>
                    <input type="checkbox" checked={chosen.includes(id)} onChange={() => toggle(id)} /> {commodityName(ctx, id)}
                  </label>
                ))}
              </div>
            )}
          </div>
          <label className="field"><span>{isTariff ? 'Tariff rate' : 'Severity'} <b>{pct(severity, 0)}</b><Info term="severity" /></span>
            <input type="range" min={0} max={1} step={0.01} value={severity} onChange={(e) => setSeverity(Number(e.target.value))} />
          </label>
          <div className="at-row">
            <label className="field"><span>Duration, months</span><input className="num" type="number" min={1} step={1} value={months} onChange={(e) => setMonths(Math.max(1, Math.round(Number(e.target.value) || 1)))} /></label>
            <label className="field"><span>Starts</span><input className="num" type="month" value={start} onChange={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) setStart(e.target.value); }} /></label>
          </div>
          <div className="modal-actions"><button className="btn" disabled={!region || chosen.length === 0} onClick={add}>Add to scenario</button></div>
        </div>
      )}
    </div>
  );
}
