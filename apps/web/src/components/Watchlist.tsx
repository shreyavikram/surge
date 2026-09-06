import { useState } from 'react';
import type { EngineContext } from '@surge/engine';
import { type RankedEntry, categoryColor, CATEGORY_LABEL, commodityName, focusView, type CategoryFamily } from '../engine.js';
import type { Focus } from '../state.js';
import { compactUsd } from '../format.js';
import { Filters } from './Filters.js';
import { PriceStress } from './PriceStress.js';
import { Info } from './Info.js';

interface Props {
  entries: RankedEntry[];
  others: RankedEntry[];            // threats outside the current filters (shown collapsed)
  selectedId: string | null;
  onSelect: (id: string) => void;
  ctx: EngineContext;
  focus: Focus; setFocus: (f: Focus) => void;
  commodities: Set<string>; setCommodities: (s: Set<string>) => void;
  families: Set<CategoryFamily>; setFamilies: (s: Set<CategoryFamily>) => void;
  readIds: Set<string>;
  onCollapse: () => void;
  scenario: boolean;                // scenario tab: this scenario's threats first, live threats collapsed
}

function Row({ e, v, selected, unread, ctx, onSelect }: { e: RankedEntry; v: ReturnType<typeof focusView>; selected: boolean; unread: boolean; ctx: EngineContext; onSelect: (id: string) => void }) {
  const t = e.threat;
  return (
    <div className={`wl-row ${selected ? 'sel' : ''} ${v.affects ? '' : 'dim'}`} onClick={() => onSelect(t.id)} title={v.affects ? undefined : 'Does not reach the focus area'}>
      <span className={`wl-cat ${t.status === 'breaking' ? 'breaking' : ''}`} style={{ background: categoryColor(t.category), marginTop: 4 }} />
      <div className="wl-main">
        <div className="wl-name">{t.name}{unread && <span className="unread" title="Not yet opened" />}</div>
        <div className="wl-meta">{CATEGORY_LABEL[t.category]} · {t.location.admin ?? t.location.regionId} · {t.status === 'breaking' ? 'duration not known' : `${e.durationMonths} mo`}</div>
      </div>
      <div className="wl-loss">{compactUsd(v.cv)}<small>{e.worstCommodity ? `mostly ${commodityName(ctx, e.worstCommodity).toLowerCase()}` : '—'}</small></div>
    </div>
  );
}

export function Watchlist({ entries, others, selectedId, onSelect, ctx, focus, setFocus, commodities, setCommodities, families, setFamilies, readIds, onCollapse, scenario }: Props) {
  const [q, setQ] = useState('');
  const [showOthers, setShowOthers] = useState(false);
  const [showLive, setShowLive] = useState(false);
  const match = (e: RankedEntry) => !q || `${e.threat.name} ${e.threat.location.admin ?? ''} ${e.threat.commodities.map((c) => commodityName(ctx, c.id)).join(' ')}`.toLowerCase().includes(q.toLowerCase());
  const rows = entries.filter(match).map((e) => ({ e, v: focusView(e, focus, ctx) })).sort((a, b) => b.v.cv - a.v.cv);
  const otherRows = others.filter(match).map((e) => ({ e, v: focusView(e, focus, ctx) })).sort((a, b) => b.v.cv - a.v.cv);
  const mine = rows.filter((r) => r.e.origin === 'user');
  const live = rows.filter((r) => r.e.origin !== 'user');
  const label = rows[0]?.v.label ?? 'United States';
  const list = (xs: typeof rows) => xs.map(({ e, v }) => <Row key={e.threat.id} e={e} v={v} selected={selectedId === e.threat.id} unread={!readIds.has(e.threat.id)} ctx={ctx} onSelect={onSelect} />);
  return (
    <div className="watchlist">
      <div className="wl-head">
        <div>
          <div className="wl-title">{scenario ? 'Scenario' : 'Watchlist'}</div>
          <div className="wl-sub">{rows.length + otherRows.length} threats · by consumer welfare loss{label !== 'United States' ? ` · ${label}` : ''}</div>
        </div>
        <button className="collapse" onClick={onCollapse} title="Collapse watchlist">◀</button>
      </div>
      <Filters ctx={ctx} focus={focus} setFocus={setFocus} commodities={commodities} setCommodities={setCommodities} families={families} setFamilies={setFamilies} />
      {!scenario && <PriceStress ctx={ctx} commodities={commodities} setCommodities={setCommodities} />}
      <div className="wl-cols">
        <span>Threat</span>
        <span className="r">Consumer welfare loss<Info term="cv" /><br /><small>total over the shock · {label}</small></span>
      </div>
      <input className="wl-search" type="search" placeholder="Search threats, places, commodities…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="wl-list">
        {scenario ? (
          <>
            {mine.length === 0 && <div className="faint" style={{ padding: '10px 12px' }}>No hypothetical threats yet. Describe one above, or click a country on the map.</div>}
            {list(mine)}
            <button className="wl-group" onClick={() => setShowLive((o) => !o)}>{showLive ? '▾' : '▸'} Live threats in this scenario ({live.length})</button>
            {showLive && list(live)}
          </>
        ) : list(rows)}
        {otherRows.length > 0 && (
          <>
            <button className="wl-group" onClick={() => setShowOthers((o) => !o)}>{showOthers ? '▾' : '▸'} Other threats outside these filters ({otherRows.length})</button>
            {showOthers && list(otherRows)}
          </>
        )}
        {rows.length === 0 && otherRows.length === 0 && <div style={{ padding: 16 }} className="faint">No threats match.</div>}
      </div>
    </div>
  );
}
