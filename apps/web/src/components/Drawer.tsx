import { useMemo, useState } from 'react';
import type { EngineContext } from '@surge/engine';
import { type RankedEntry, runEntry, categoryColor, CATEGORY_LABEL } from '../engine.js';
import { pct } from '../format.js';
import { Chip } from './Chip.js';
import { Impact } from './Impact.js';
import { Relief } from './Relief.js';
import { Plate } from './Plate.js';

type Tab = 'impact' | 'plate' | 'relief';

export function Drawer({ entry, ctx }: { entry: RankedEntry | null; ctx: EngineContext }) {
  const [tab, setTab] = useState<Tab>('impact');
  const run = useMemo(() => (entry ? runEntry(entry, ctx) : null), [entry?.threat.id, ctx]);

  if (!entry || !run) {
    return <div className="drawer empty">Select a threat on the map or watchlist to see its consumer impact, supply-chain reach, and relief options.</div>;
  }

  const t = entry.threat;
  const shocked = new Set(run.impact.commodities);

  return (
    <div className="drawer">
      <div className="dr-head">
        <div className="dr-title">{t.name}</div>
        <div className="dr-sub">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span className="dot" style={{ background: categoryColor(t.category) }} /> {CATEGORY_LABEL[t.category]}
          </span>
          <span>· {t.location.admin ?? t.location.regionId}</span>
          <span>· severity {pct(t.severity, 0)}</span>
          <span>· {run.impact.durationMonths} mo</span>
          {entry.origin === 'seed'
            ? <Chip kind="seed" title={t.source.feed + (t.source.note ? ` — ${t.source.note}` : '')}>seed</Chip>
            : <Chip kind="observed" title={t.source.feed}>replay</Chip>}
        </div>
      </div>
      <div className="tabs">
        <button className={tab === 'impact' ? 'on' : ''} onClick={() => setTab('impact')}>Impact</button>
        <button className={tab === 'plate' ? 'on' : ''} onClick={() => setTab('plate')}>Plate</button>
        <button className={tab === 'relief' ? 'on' : ''} onClick={() => setTab('relief')}>Relief</button>
      </div>
      <div className="dr-body">
        {tab === 'impact' && <Impact impact={run.impact} ctx={ctx} />}
        {tab === 'plate' && <Plate ctx={ctx} shocked={shocked} />}
        {tab === 'relief' && <Relief mitigation={run.mitigation} impact={run.impact} ctx={ctx} />}
      </div>
    </div>
  );
}
