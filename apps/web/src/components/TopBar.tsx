import type { TabDef } from '../state.js';
import { LIVE_TAB } from '../state.js';

interface Props {
  tabs: TabDef[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onNewTab: () => void;
  onRenameTab: (id: string, name: string) => void;
  onCloseTab: (id: string) => void;
  feedStatus: string;
  onSettings: () => void;
  onCompare: () => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

export function TopBar({ tabs, activeTab, onSelectTab, onNewTab, onRenameTab, onCloseTab, feedStatus, onSettings, onCompare, theme, toggleTheme }: Props) {
  return (
    <div className="topbar">
      <a className="brand" href="/" title="Greenfield"><img className="brand-logo" src="/brand/greenfield-logo.svg" alt="Greenfield" /></a>
      <div className="tabs-bar">
        {[LIVE_TAB, ...tabs].map((t) => (
          <div key={t.id} className={`tab ${activeTab === t.id ? 'on' : ''} ${t.id === 'live' ? 'live' : ''}`} onClick={() => onSelectTab(t.id)}
            >
            {t.id === 'live' && <span className="dot live-dot" />}
            {activeTab === t.id && t.id !== 'live'
              ? <input className="tab-rename" value={t.name} onClick={(e) => e.stopPropagation()} onChange={(e) => onRenameTab(t.id, e.target.value)} size={Math.max(6, Math.min(24, t.name.length))} title="Type to rename" />
              : <span className="tab-name">{t.name}</span>}
            {t.id !== 'live' && <button className="tab-x" title="Close scenario" onClick={(e) => { e.stopPropagation(); onCloseTab(t.id); }}>×</button>}
          </div>
        ))}
        <button className="tab new" onClick={onNewTab} title="New scenario (copies the live picture)">+ New scenario</button>
        {tabs.length > 0 && <button className="btn ghost small" onClick={onCompare}>Compare scenarios</button>}
      </div>
      <div className="spacer" />
      <div className="feedstatus" title="Feed status">{feedStatus}</div>
      <button className="iconbtn" onClick={onSettings} title="Settings and alerts">⚙</button>
      <button className="iconbtn" onClick={toggleTheme} title="Toggle theme">{theme === 'dark' ? '☀' : '☾'}</button>
    </div>
  );
}
