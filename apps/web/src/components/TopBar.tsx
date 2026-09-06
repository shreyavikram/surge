import type { EngineContext } from '@surge/engine';
import type { TabDef, Focus } from '../state.js';
import { LIVE_TAB } from '../state.js';

interface Props {
  ctx: EngineContext;
  tabs: TabDef[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onNewTab: () => void;
  onRenameTab: (id: string, name: string) => void;
  onCloseTab: (id: string) => void;
  focus: Focus;
  setFocus: (f: Focus) => void;
  feedStatus: string;
  onSettings: () => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

export function TopBar({ ctx, tabs, activeTab, onSelectTab, onNewTab, onRenameTab, onCloseTab, focus, setFocus, feedStatus, onSettings, theme, toggleTheme }: Props) {
  const states = (ctx.focus?.areas ?? []).filter((a) => a.kind === 'state').sort((a, b) => a.name.localeCompare(b.name));
  const districts = (ctx.focus?.areas ?? []).filter((a) => a.kind === 'district').sort((a, b) => a.id.localeCompare(b.id));
  const focusValue = focus.kind === 'us' ? 'us' : `${focus.kind}:${focus.id}`;
  return (
    <div className="topbar">
      <div className="brand">SUR<span>GE</span></div>
      <div className="tabs-bar">
        {[LIVE_TAB, ...tabs].map((t) => (
          <div key={t.id} className={`tab ${activeTab === t.id ? 'on' : ''} ${t.id === 'live' ? 'live' : ''}`} onClick={() => onSelectTab(t.id)}
            onDoubleClick={() => { if (t.id !== 'live') { const n = prompt('Rename scenario', t.name); if (n) onRenameTab(t.id, n); } }}>
            {t.id === 'live' && <span className="dot live-dot" />}
            <span className="tab-name">{t.name}</span>
            {t.id !== 'live' && <button className="tab-x" title="Close scenario" onClick={(e) => { e.stopPropagation(); onCloseTab(t.id); }}>×</button>}
          </div>
        ))}
        <button className="tab new" onClick={onNewTab} title="New scenario (copies the live picture)">+ New scenario</button>
      </div>
      <div className="spacer" />
      <label className="focus-sel">
        <span className="lbl">Focus</span>
        <select value={focusValue} onChange={(e) => {
          const v = e.target.value;
          if (v === 'us') setFocus({ kind: 'us' });
          else { const [kind, id] = v.split(':'); setFocus({ kind: kind as Focus['kind'], id }); }
        }}>
          <option value="us">United States</option>
          <optgroup label="States">
            {states.map((a) => <option key={a.id} value={`state:${a.id}`}>{a.name}</option>)}
          </optgroup>
          {districts.length > 0 && (
            <optgroup label="Congressional districts">
              {districts.map((a) => <option key={a.id} value={`district:${a.id}`}>{a.id} · {a.name}</option>)}
            </optgroup>
          )}
        </select>
      </label>
      <div className="feedstatus" title="Feed status">{feedStatus}</div>
      <button className="iconbtn" onClick={onSettings} title="Settings and alerts">⚙</button>
      <button className="iconbtn" onClick={toggleTheme} title="Toggle theme">{theme === 'dark' ? '☀' : '☾'}</button>
    </div>
  );
}
