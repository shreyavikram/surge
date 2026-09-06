import { useState } from 'react';
import type { Settings as S } from '../state.js';

export function Settings({ settings, onSave, onClose, focusLabel }: { settings: S; onSave: (s: S) => void; onClose: () => void; focusLabel: string }) {
  const [email, setEmail] = useState(settings.email);
  const [alerts, setAlerts] = useState(settings.alerts);
  const [status, setStatus] = useState<string | null>(null);
  const save = async () => {
    const next = { ...settings, email, alerts };
    onSave(next);
    try {
      const r = await fetch('/api/alerts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, enabled: alerts, focus: focusLabel }) });
      setStatus(r.ok ? 'Saved. New threats will be emailed as they appear.' : 'Saved locally; the server could not store the subscription.');
    } catch { setStatus('Saved locally; alerts send when the server is reachable.'); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>Settings</h3><button className="iconbtn" onClick={onClose}>×</button></div>
        <label className="field"><span>Email for alerts</span><input type="email" value={email} placeholder="staffer@house.gov" onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field row"><input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} /><span>Email me when a new threat appears that reaches <b>{focusLabel}</b></span></label>
        <div className="modal-actions"><button className="btn" onClick={() => void save()} disabled={alerts && !email}>Save</button></div>
        {status && <div className="subfig">{status}</div>}
      </div>
    </div>
  );
}
