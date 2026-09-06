import { useEffect, useRef, useState } from 'react';
import type { EngineContext } from '@surge/engine';
import type { Focus } from '../state.js';
import { commodityName, type CategoryFamily } from '../engine.js';

const FAMILIES: { id: CategoryFamily; label: string }[] = [
  { id: 'geopolitical', label: 'Trade and geopolitics' }, { id: 'natural', label: 'Weather and climate' }, { id: 'biological', label: 'Pest and disease' }, { id: 'supply', label: 'Inputs and facilities' },
];

interface Props {
  ctx: EngineContext;
  focus: Focus; setFocus: (f: Focus) => void;
  commodities: Set<string>; setCommodities: (s: Set<string>) => void;
  families: Set<CategoryFamily>; setFamilies: (s: Set<CategoryFamily>) => void;
}

/** A button that opens a checkbox list. Closes on outside click. */
function Dropdown({ label, summary, children }: { label: string; summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className={`dd ${open ? 'open' : ''}`} ref={ref}>
      <button className="dd-btn" onClick={() => setOpen((o) => !o)}><span className="dd-lbl">{label}</span><span className="dd-sum">{summary}</span><span className="dd-caret">▾</span></button>
      {open && <div className="dd-pop">{children}</div>}
    </div>
  );
}

function toggle<T>(set: Set<T>, v: T): Set<T> { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); return n; }

export function Filters({ ctx, focus, setFocus, commodities, setCommodities, families, setFamilies }: Props) {
  const [q, setQ] = useState('');
  const areas = (ctx.focus?.areas ?? []).filter((a) => a.kind === (focus.kind === 'district' ? 'district' : 'state'));
  const shown = areas.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()) || a.id.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.id.localeCompare(b.id));
  const hasDistricts = (ctx.focus?.areas ?? []).some((a) => a.kind === 'district');
  const areaSummary = focus.kind === 'us' || focus.ids.length === 0 ? 'United States' : focus.ids.length <= 2 ? focus.ids.join(', ') : `${focus.ids.length} selected`;
  const groups = new Map<string, string[]>();
  for (const c of Object.values(ctx.commodities)) groups.set(c.group, [...(groups.get(c.group) ?? []), c.id]);
  const inputIds = Object.keys(ctx.inputs);
  const commSummary = commodities.size === 0 ? 'All commodities' : commodities.size <= 2 ? [...commodities].map((id) => commodityName(ctx, id)).join(', ') : `${commodities.size} selected`;
  const famSummary = families.size === 0 ? 'All kinds' : families.size === 1 ? FAMILIES.find((f) => f.id === [...families][0])!.label : `${families.size} kinds`;
  return (
    <div className="filters">
      <Dropdown label="Area" summary={areaSummary}>
        <div className="dd-kind">
          {(['us', 'state', 'district'] as const).map((k) => (
            (k !== 'district' || hasDistricts) && <label key={k}><input type="radio" name="focus-kind" checked={focus.kind === k} onChange={() => setFocus({ kind: k, ids: [] })} /> {k === 'us' ? 'United States' : k === 'state' ? 'States' : 'Congressional districts'}</label>
          ))}
        </div>
        {focus.kind !== 'us' && (
          <>
            <input className="dd-search" placeholder={`Search ${focus.kind === 'state' ? 'states' : 'districts'}…`} value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="dd-list">
              {shown.map((a) => (
                <label key={a.id}><input type="checkbox" checked={focus.ids.includes(a.id)} onChange={() => setFocus({ ...focus, ids: focus.ids.includes(a.id) ? focus.ids.filter((x) => x !== a.id) : [...focus.ids, a.id] })} /> {focus.kind === 'district' ? `${a.id} · ` : ''}{a.name}</label>
              ))}
            </div>
            {focus.ids.length > 0 && <button className="linkbtn" onClick={() => setFocus({ ...focus, ids: [] })}>clear</button>}
          </>
        )}
      </Dropdown>
      <Dropdown label="Commodities" summary={commSummary}>
        <div className="dd-list">
          {[...groups.entries()].map(([g, ids]) => (
            <div key={g} className="dd-group">
              <div className="dd-gh">{ctx.demand.items.find((i) => i.id === g)?.label ?? g}</div>
              {ids.map((id) => <label key={id}><input type="checkbox" checked={commodities.has(id)} onChange={() => setCommodities(toggle(commodities, id))} /> {commodityName(ctx, id)}</label>)}
            </div>
          ))}
          <div className="dd-group">
            <div className="dd-gh">Inputs</div>
            {inputIds.map((id) => <label key={id}><input type="checkbox" checked={commodities.has(id)} onChange={() => setCommodities(toggle(commodities, id))} /> {commodityName(ctx, id)}</label>)}
          </div>
        </div>
        {commodities.size > 0 && <button className="linkbtn" onClick={() => setCommodities(new Set())}>clear</button>}
      </Dropdown>
      <Dropdown label="Kind" summary={famSummary}>
        <div className="dd-list">
          {FAMILIES.map((f) => <label key={f.id}><input type="checkbox" checked={families.has(f.id)} onChange={() => setFamilies(toggle(families, f.id))} /> {f.label}</label>)}
        </div>
        {families.size > 0 && <button className="linkbtn" onClick={() => setFamilies(new Set())}>clear</button>}
      </Dropdown>
    </div>
  );
}
