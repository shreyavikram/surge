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
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

export function TopBar({ tabs, activeTab, onSelectTab, onNewTab, onRenameTab, onCloseTab, feedStatus, onSettings, theme, toggleTheme }: Props) {
  return (
    <div className="topbar">
      <a className="brand" href="/" title="Greenfield"><img className="brand-logo" src="/brand/greenfield-logo.svg" alt="Greenfield" /></a>
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
      <div className="feedstatus" title="Feed status">{feedStatus}</div>
      <button className="iconbtn" onClick={onSettings} title="Settings and alerts">⚙</button>
      <button className="iconbtn" onClick={toggleTheme} title="Toggle theme">{theme === 'dark' ? '☀' : '☾'}</button>
    </div>
  );
}
