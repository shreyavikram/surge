import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Threat } from '@surge/engine';
import { getContext, buildBaseList, entriesForTab, rankEntries, categoryFamily, getArea, type CategoryFamily, type ThreatEntry } from './engine.js';
import { useTabs, useFocus, useRead, useSettings, LIVE_TAB, type TabDef } from './state.js';
import { TopBar } from './components/TopBar.js';
import { Watchlist } from './components/Watchlist.js';
import { MapView } from './components/MapView.js';
import { Drawer } from './components/Drawer.js';
import { Compare } from './components/Compare.js';
import { Describe } from './components/Describe.js';
import { Settings } from './components/Settings.js';

interface Health { rows?: { id: string; kind: string; stale?: boolean; ok?: boolean }[] }

export function App() {
  const ctx = useMemo(() => getContext(), []);
  const { tabs, create, update, remove, rename } = useTabs();
  const { focus, setFocus } = useFocus();
  const { readIds, markRead } = useRead();
  const { settings, setSettings } = useSettings();
  const [theme, setTheme] = useState<'dark' | 'light'>(settings.theme);
  const [activeTab, setActiveTab] = useState<string>('live');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CategoryFamily | 'all'>('all');
  const [wlOpen, setWlOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [live, setLive] = useState<Threat[] | undefined>(undefined);
  const [feedStatus, setFeedStatus] = useState('seeds · 2 replays');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    setSettings((s) => (s.theme === theme ? s : { ...s, theme }));
  }, [theme, setSettings]);

  // live threats from the server when it is reachable; the in-browser seeds otherwise
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const r = await fetch('/api/threats');
        if (!r.ok) return;
        const d = (await r.json()) as { threats: Threat[] };
        if (on && d.threats?.length) setLive(d.threats);
        const h = await fetch('/api/health');
        if (h.ok && on) {
          const hj = (await h.json()) as Health;
          const rows = hj.rows ?? [];
          const liveN = rows.filter((x) => x.kind === 'live' && !x.stale).length;
          const stale = rows.filter((x) => x.stale).length;
          setFeedStatus(`${liveN} live feeds${stale ? ` · ${stale} on snapshot` : ''} · 2 replays`);
        }
      } catch { /* offline */ }
    })();
    return () => { on = false; };
  }, []);

  const base = useMemo(() => buildBaseList(live), [live]);
  const tab: TabDef = activeTab === 'live' ? LIVE_TAB : tabs.find((t) => t.id === activeTab) ?? LIVE_TAB;
  const entries = useMemo(() => entriesForTab(base, tab), [base, tab]);
  const ranked = useMemo(() => rankEntries(entries, ctx), [entries, ctx]);
  const visible = filter === 'all' ? ranked : ranked.filter((e) => categoryFamily(e.threat.category) === filter);
  const selectedEntry = ranked.find((e) => e.threat.id === selectedId) ?? null;
  const editable = tab.id !== 'live';

  const select = useCallback((id: string) => { setSelectedId(id); markRead(id); setDrawerOpen(true); }, [markRead]);
  const entriesFor = useCallback((t: TabDef): ThreatEntry[] => entriesForTab(base, t), [base]);

  const onDial = (threatId: string, patch: { severity?: number; months?: number }) => update(tab.id, (t) => {
    const cur = { ...(t.overrides[threatId] ?? {}) };
    if ('severity' in patch) { if (patch.severity === undefined) delete cur.severity; else cur.severity = patch.severity; }
    if ('months' in patch) { if (patch.months === undefined) delete cur.months; else cur.months = patch.months; }
    const overrides = { ...t.overrides };
    if (Object.keys(cur).length === 0) delete overrides[threatId]; else overrides[threatId] = cur;
    return { ...t, overrides };
  });
  const onRemove = (threatId: string) => { update(tab.id, (t) => ({ ...t, removed: [...t.removed, threatId], added: t.added.filter((a) => a.id !== threatId) })); setSelectedId(null); setDrawerOpen(false); };
  const onAdd = (t: Threat) => { update(tab.id, (x) => ({ ...x, added: [...x.added, t] })); select(t.id); };
  const newTab = () => { const n = prompt('Scenario name', `Scenario ${tabs.length + 1}`); if (n) { const t = create(n); setActiveTab(t.id); } };
  const closeTab = (id: string) => { remove(id); if (activeTab === id) setActiveTab('live'); };
  const focusLabel = focus.kind === 'us' || !focus.id || !ctx.focus ? 'United States' : getArea(ctx.focus, focus.id)?.name ?? 'United States';

  return (
    <div className="app">
      <TopBar ctx={ctx} tabs={tabs} activeTab={activeTab} onSelectTab={(id) => { setActiveTab(id); setSelectedId(null); setDrawerOpen(false); }} onNewTab={newTab} onRenameTab={rename} onCloseTab={closeTab}
        focus={focus} setFocus={setFocus} feedStatus={feedStatus} onSettings={() => setShowSettings(true)} theme={theme} toggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
      {editable && (
        <div className="scenario-bar">
          <Describe ctx={ctx} onAdd={onAdd} />
          <button className="btn ghost" onClick={() => setShowCompare(true)}>Compare scenarios</button>
        </div>
      )}
      <div className="body">
        {wlOpen ? (
          <Watchlist entries={visible} selectedId={selectedId} onSelect={select} ctx={ctx} filter={filter} onFilter={setFilter} focus={focus} readIds={readIds} onCollapse={() => setWlOpen(false)} />
        ) : (
          <button className="edge-toggle left" onClick={() => setWlOpen(true)} title="Show watchlist">▶</button>
        )}
        <MapView entries={visible} selectedId={selectedId} onSelect={select} theme={theme} ctx={ctx} focus={focus} readIds={readIds} />
        {drawerOpen && selectedEntry ? (
          <Drawer entry={selectedEntry} ctx={ctx} focus={focus} tab={tab} editable={editable} onDial={onDial} onRemove={onRemove} onCollapse={() => setDrawerOpen(false)} />
        ) : selectedEntry ? (
          <button className="edge-toggle right" onClick={() => setDrawerOpen(true)} title="Show analysis">◀</button>
        ) : null}
      </div>
      {showCompare && <Compare ctx={ctx} tabs={tabs} base={base} entriesFor={entriesFor} focus={focus} onClose={() => setShowCompare(false)} />}
      {showSettings && <Settings settings={settings} onSave={setSettings} onClose={() => setShowSettings(false)} focusLabel={focusLabel} />}
    </div>
  );
}
