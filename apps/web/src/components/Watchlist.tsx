import type { EngineContext } from '@surge/engine';
import { type RankedEntry, categoryColor, categoryFamily, CATEGORY_LABEL, commodityName, focusView, type CategoryFamily } from '../engine.js';
import type { Focus } from '../state.js';
import { compactUsd } from '../format.js';

const FAMILIES: { id: CategoryFamily | 'all'; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'geopolitical', label: 'Trade' }, { id: 'natural', label: 'Weather' }, { id: 'biological', label: 'Disease' }, { id: 'supply', label: 'Input' },
];

interface Props {
  entries: RankedEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  ctx: EngineContext;
  filter: CategoryFamily | 'all';
  onFilter: (f: CategoryFamily | 'all') => void;
  focus: Focus;
  readIds: Set<string>;
  onCollapse: () => void;
}

export function Watchlist({ entries, selectedId, onSelect, ctx, filter, onFilter, focus, readIds, onCollapse }: Props) {
  const rows = entries.map((e) => ({ e, v: focusView(e, focus, ctx) })).sort((a, b) => b.v.cv - a.v.cv);
  return (
    <div className="watchlist">
      <div className="wl-head">
        <div>
          <div className="wl-title">Watchlist</div>
          <div className="wl-sub">{rows.length} threats · by consumer welfare loss{focus.kind !== 'us' ? ` · ${rows[0]?.v.label ?? ''}` : ''}</div>
        </div>
        <button className="collapse" onClick={onCollapse} title="Collapse watchlist">◀</button>
      </div>
      <div className="wl-filters">
        {FAMILIES.map((f) => (
          <button key={f.id} className={`pill ${filter === f.id ? 'on' : ''}`} onClick={() => onFilter(f.id)}>{f.label}</button>
        ))}
      </div>
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
        {rows.length === 0 && <div style={{ padding: 16 }} className="faint">No threats in this filter.</div>}
      </div>
    </div>
  );
}
