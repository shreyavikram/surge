import { useState } from 'react';
import type { EngineContext } from '@surge/engine';
import type { Settings as S, Focus } from '../state.js';
import { focusLabel, type CategoryFamily } from '../engine.js';
import { Filters } from './Filters.js';

type Frequency = NonNullable<S['frequency']>;

interface Props {
  settings: S; onSave: (s: S) => void; onClose: () => void;
  ctx: EngineContext;
  /** the watchlist's current filters seed the alert filters */
  focus: Focus; commodities: Set<string>; families: Set<CategoryFamily>;
}

/**
 * Email alerts. The subscriber picks the same filters the watchlist has (importer area, commodities, threat type)
 * and how often to hear: as each threat appears, or a weekly or monthly digest.
 */
export function Settings({ settings, onSave, onClose, ctx, focus: focus0, commodities: comm0, families: fam0 }: Props) {
  const [email, setEmail] = useState(settings.email);
  const [alerts, setAlerts] = useState(settings.alerts);
  const [frequency, setFrequency] = useState<Frequency>(settings.frequency ?? 'immediate');
  const [focus, setFocus] = useState<Focus>(focus0);
  const [commodities, setCommodities] = useState<Set<string>>(() => new Set(comm0));
  const [families, setFamilies] = useState<Set<CategoryFamily>>(() => new Set(fam0));
  const [status, setStatus] = useState<string | null>(null);
  const label = focusLabel(focus, ctx);
  const save = async () => {
    onSave({ ...settings, email, alerts, frequency });
    try {
      const body = { email, enabled: alerts, focus: label, filters: { focus, commodities: [...commodities], families: [...families] }, frequency };
      const r = await fetch('/api/alerts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      setStatus(r.ok ? (frequency === 'immediate' ? 'Saved. New threats that match these filters will be emailed as they appear.' : `Saved. You will get a ${frequency} digest of new threats that match these filters.`) : 'Saved locally; the server could not store the subscription.');
    } catch { setStatus('Saved locally; alerts send when the server is reachable.'); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>Email alerts</h3><button className="iconbtn" onClick={onClose}>×</button></div>
        <label className="field"><span>Email</span><input type="email" value={email} placeholder="staffer@house.gov" onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field row"><input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} /><span>Email me about new threats that match the filters below</span></label>
        <div className="field"><span>Only these threats</span>
          <div className="alert-filters"><Filters ctx={ctx} focus={focus} setFocus={setFocus} commodities={commodities} setCommodities={setCommodities} families={families} setFamilies={setFamilies} /></div>
          <div className="subfig">Importer: {label} · {commodities.size === 0 ? 'all commodities' : `${commodities.size} commodit${commodities.size === 1 ? 'y' : 'ies'}`} · {families.size === 0 ? 'all threat types' : `${families.size} threat type${families.size === 1 ? '' : 's'}`}</div>
        </div>
        <div className="field"><span>How often</span>
          <div className="radio-row">
            {([['immediate', 'As each threat appears'], ['weekly', 'Weekly digest'], ['monthly', 'Monthly digest']] as [Frequency, string][]).map(([v, text]) => (
              <label key={v} className="radio"><input type="radio" name="freq" checked={frequency === v} onChange={() => setFrequency(v)} /><span>{text}</span></label>
            ))}
          </div>
        </div>
        <div className="modal-actions"><button className="btn" onClick={() => void save()} disabled={alerts && !email}>Save</button></div>
        {status && <div className="subfig">{status}</div>}
      </div>
    </div>
  );
}
