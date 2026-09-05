import type { EngineContext } from '@surge/engine';
import { type RankedEntry, categoryColor, categoryFamily, CATEGORY_LABEL, commodityName, type CategoryFamily } from '../engine.js';
import { compactUsd } from '../format.js';
import { Chip } from './Chip.js';

const FAMILIES: { id: CategoryFamily | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'geopolitical', label: 'Trade' },
  { id: 'natural', label: 'Weather' },
  { id: 'biological', label: 'Disease' },
  { id: 'supply', label: 'Input' },
];

interface Props {
  entries: RankedEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  ctx: EngineContext;
  filter: CategoryFamily | 'all';
  onFilter: (f: CategoryFamily | 'all') => void;
}

export function Watchlist({ entries, selectedId, onSelect, ctx, filter, onFilter }: Props) {
  return (
    <div className="watchlist">
      <div className="wl-head">
        <div className="wl-title">Watchlist</div>
        <div className="wl-sub">{entries.length} threats · ranked by consumer welfare loss</div>
      </div>
      <div className="wl-filters">
        {FAMILIES.map((f) => (
          <button key={f.id} className={`pill ${filter === f.id ? 'on' : ''}`} onClick={() => onFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="wl-list">
        {entries.map((e, i) => {
          const t = e.threat;
          return (
            <div
              key={t.id}
              className={`wl-row ${selectedId === t.id ? 'sel' : ''}`}
              onClick={() => onSelect(t.id)}
            >
              <span className="wl-cat" style={{ background: categoryColor(t.category), marginTop: 4 }} />
              <div>
                <div className="wl-name">{t.name}</div>
                <div className="wl-meta">
                  {CATEGORY_LABEL[t.category]} · {t.location.admin ?? t.location.regionId} · {e.durationMonths} mo{' '}
                  {e.origin === 'seed'
                    ? <Chip kind="seed" title={t.source.note}>seed</Chip>
                    : <Chip kind="observed" title="Historical replay at observed prices">replay</Chip>}
                </div>
              </div>
              <div className="wl-loss">
                {compactUsd(e.cv)}
                <small>{e.worstCommodity ? commodityName(ctx, e.worstCommodity) : '—'}</small>
              </div>
            </div>
          );
        })}
        {entries.length === 0 && <div style={{ padding: 16 }} className="faint">No threats in this filter.</div>}
      </div>
    </div>
  );
}
