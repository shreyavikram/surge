import type { EngineContext } from '@surge/engine';
import { type RankedEntry, categoryColor, CATEGORY_LABEL, commodityName, focusView, type CategoryFamily } from '../engine.js';
import type { Focus } from '../state.js';
import { compactUsd } from '../format.js';
import { Filters } from './Filters.js';

interface Props {
  entries: RankedEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  ctx: EngineContext;
  focus: Focus; setFocus: (f: Focus) => void;
  commodities: Set<string>; setCommodities: (s: Set<string>) => void;
  families: Set<CategoryFamily>; setFamilies: (s: Set<CategoryFamily>) => void;
  readIds: Set<string>;
  onCollapse: () => void;
}

export function Watchlist({ entries, selectedId, onSelect, ctx, focus, setFocus, commodities, setCommodities, families, setFamilies, readIds, onCollapse }: Props) {
  const rows = entries.map((e) => ({ e, v: focusView(e, focus, ctx) })).sort((a, b) => b.v.cv - a.v.cv);
  return (
    <div className="watchlist">
      <div className="wl-head">
        <div>
          <div className="wl-title">Watchlist</div>
          <div className="wl-sub">{rows.length} threats · by consumer welfare loss{rows[0] && rows[0].v.label !== 'United States' ? ` · ${rows[0].v.label}` : ''}</div>
        </div>
        <button className="collapse" onClick={onCollapse} title="Collapse watchlist">◀</button>
      </div>
      <Filters ctx={ctx} focus={focus} setFocus={setFocus} commodities={commodities} setCommodities={setCommodities} families={families} setFamilies={setFamilies} />
      <div className="wl-list">
        {rows.map(({ e, v }) => {
          const t = e.threat;
          const unread = !readIds.has(t.id);
          return (
            <div key={t.id} className={`wl-row ${selectedId === t.id ? 'sel' : ''} ${v.affects ? '' : 'dim'}`} onClick={() => onSelect(t.id)} title={v.affects ? undefined : 'Does not reach the focus area'}>
              <span className={`wl-cat ${t.status === 'breaking' ? 'breaking' : ''}`} style={{ background: categoryColor(t.category), marginTop: 4 }} />
              <div className="wl-main">
                <div className="wl-name">{t.name}{unread && <span className="unread" title="Not yet opened" />}</div>
                <div className="wl-meta">{CATEGORY_LABEL[t.category]} · {t.location.admin ?? t.location.regionId} · {e.durationMonths} mo</div>
              </div>
              <div className="wl-loss">
                {compactUsd(v.cv)}
                <small>{e.worstCommodity ? commodityName(ctx, e.worstCommodity) : '—'}</small>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div style={{ padding: 16 }} className="faint">No threats match these filters.</div>}
      </div>
    </div>
  );
}
