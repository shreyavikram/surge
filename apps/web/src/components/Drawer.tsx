import { useState } from 'react';
import type { EngineContext } from '@surge/engine';
import { type RankedEntry, categoryColor, CATEGORY_LABEL, type Threat } from '../engine.js';
import type { Focus, TabDef } from '../state.js';
import { pct } from '../format.js';
import { Chip } from './Chip.js';
import { Info } from './Info.js';
import { Impact } from './Impact.js';
import { Distribution } from './Distribution.js';
import { Relief } from './Relief.js';

type Tab = 'impact' | 'distribution' | 'relief';

interface Props {
  entry: RankedEntry | null;
  ctx: EngineContext;
  focus: Focus;
  tab: TabDef;
  editable: boolean;
  onDial: (threatId: string, patch: { severity?: number; months?: number }) => void;
  onRemove: (threatId: string) => void;
  /** copy a live threat, with its dials, into the scenario's own list and drop the live original from this scenario */
  onSaveAsHypothetical?: (t: Threat) => void;
  /** bake the current dials into a hypothetical that was saved earlier */
  onUpdateHypothetical?: (t: Threat) => void;
  onCollapse: () => void;
}

export function Drawer({ entry, ctx, focus, tab, editable, onDial, onRemove, onSaveAsHypothetical, onUpdateHypothetical, onCollapse }: Props) {
  const [view, setView] = useState<Tab>('impact');
  if (!entry) return null;
  const t = entry.threat;
  const isTariff = t.category === 'tariff';
  const originChip = entry.origin === 'seed' ? <Chip kind="seed" title={t.source.feed + (t.source.note ? ` — ${t.source.note}` : '')}>seed</Chip>
    : entry.origin === 'replay' ? <Chip kind="observed" title={t.source.feed}>replay</Chip>
    : entry.origin === 'user' ? <Chip kind="seed" title={t.source.note ?? t.source.feed}>hypothetical</Chip>
    : <Chip kind="measured" title={t.source.feed}>{t.source.stale ? 'stale' : 'live'}</Chip>;
  return (
    <div className="drawer">
      <div className="dr-head">
        <div className="dr-titlerow">
          <div className="dr-title">{t.name}</div>
          <button className="collapse" onClick={onCollapse} title="Collapse panel">▶</button>
        </div>
        <div className="dr-sub">
          <span className="inl"><span className="dot" style={{ background: categoryColor(t.category) }} /> {CATEGORY_LABEL[t.category]}</span>
          <span>· {t.location.admin ?? t.location.regionId}</span>
          <span>· {isTariff ? 'rate' : 'severity'} {pct(t.severity, 0)}<Info term="severity" /></span>
          <span>· {t.status === 'breaking' ? 'duration not known' : `${entry.durationMonths} mo`}<Info term="duration" /></span>
          {t.status === 'breaking' && <Chip kind="seed" title="Possible disruption, not yet in any series">possible<Info term="breaking" /></Chip>}
          {originChip}
        </div>
        {editable && (
          <div className="dials">
            <label>
              <span>{isTariff ? 'Tariff rate' : 'Severity'} <b>{pct(t.severity, 0)}</b></span>
              <input type="range" min={0} max={1} step={0.01} value={t.severity} onChange={(e) => onDial(t.id, { severity: Number(e.target.value) })} />
            </label>
            <label>
              <span>{t.status === 'breaking' ? 'Assumed duration, months (not known; the default for this kind of threat)' : 'Duration, months'}</span>
              <input className="num" type="number" min={1} step={1} value={t.months ?? entry.durationMonths} onChange={(e) => { const n = Math.max(1, Math.round(Number(e.target.value) || 1)); onDial(t.id, { months: n }); }} />
            </label>
            <div className="dial-actions">
              {tab.overrides[t.id] && <button className="linkbtn" onClick={() => onDial(t.id, { severity: undefined, months: undefined })}>reset</button>}
              {entry.origin !== 'user' && onSaveAsHypothetical && <button className="btn" title="Keep this dialed version as one of the scenario's own threats; the live original leaves this scenario" onClick={() => onSaveAsHypothetical(t)}>Save as hypothetical</button>}
              {entry.origin === 'user' && tab.overrides[t.id] && onUpdateHypothetical && <button className="btn" title="Keep these dials as the hypothetical's new settings" onClick={() => onUpdateHypothetical(t)}>Update hypothetical</button>}
              <button className="btn danger" onClick={() => onRemove(t.id)}>Remove from scenario</button>
            </div>
          </div>
        )}
      </div>
      <div className="tabs">
        <button className={view === 'impact' ? 'on' : ''} onClick={() => setView('impact')}>Impact</button>
        <button className={view === 'distribution' ? 'on' : ''} onClick={() => setView('distribution')}>Distribution</button>
        <button className={view === 'relief' ? 'on' : ''} onClick={() => setView('relief')}>Relief</button>
      </div>
      <div className="dr-body">
        {view === 'impact' && <Impact entry={entry} ctx={ctx} focus={focus} />}
        {view === 'distribution' && <Distribution entry={entry} ctx={ctx} focus={focus} />}
        {view === 'relief' && <Relief entry={entry} ctx={ctx} focus={focus} />}
      </div>
    </div>
  );
}
