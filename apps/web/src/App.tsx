import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Threat } from '@surge/engine';
import { getContext, buildBaseList, entriesForTab, rankEntries, categoryFamily, focusLabel, type CategoryFamily, type ThreatEntry } from './engine.js';
import { useTabs, useFocus, useRead, useSettings, LIVE_TAB, type TabDef } from './state.js';
import { TopBar } from './components/TopBar.js';
import { Watchlist } from './components/Watchlist.js';
import { MapView } from './components/MapView.js';
import { Drawer } from './components/Drawer.js';
import { Compare } from './components/Compare.js';
import { Describe } from './components/Describe.js';
import { Settings } from './components/Settings.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';

interface Health { feeds?: { id: string; kind: string; status: string; stale?: boolean }[] }

export function App() {
  const ctx = useMemo(() => getContext(), []);
  const { tabs, create, update, remove, rename } = useTabs();
  const { focus, setFocus } = useFocus();
  const { readIds, markRead } = useRead();
  const { settings, setSettings } = useSettings();
  const [theme, setTheme] = useState<'dark' | 'light'>(settings.theme);
  const [activeTab, setActiveTab] = useState<string>('live');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [families, setFamilies] = useState<Set<CategoryFamily>>(new Set());
  const [commodities, setCommodities] = useState<Set<string>>(new Set());
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
        const d = (await r.json()) as { threats: ({ threat: Threat } | Threat)[] };
        // the server returns ranked wrappers; accept bare threats too, and drop anything malformed
        const list = (d.threats ?? []).map((x) => ('threat' in x ? x.threat : x)).filter((t) => t && typeof t.id === 'string' && t.location && Array.isArray(t.commodities));
        if (on && list.length) setLive(list);
        const h = await fetch('/api/health');
        if (h.ok && on) {
          const hj = (await h.json()) as Health;
          const rows = hj.feeds ?? [];
          const liveN = rows.filter((x) => x.status === 'live').length;
          const stale = rows.filter((x) => x.status !== 'live').length;
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
  const visible = ranked.filter((e) => (families.size === 0 || families.has(categoryFamily(e.threat.category)))
    && (commodities.size === 0 || e.impact.commodities.some((c) => commodities.has(c)) || e.threat.commodities.some((c) => commodities.has(c.id))));
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
  const fLabel = focusLabel(focus, ctx);

  return (
    <div className="app">
      <TopBar tabs={tabs} activeTab={activeTab} onSelectTab={(id) => { setActiveTab(id); setSelectedId(null); setDrawerOpen(false); }} onNewTab={newTab} onRenameTab={rename} onCloseTab={closeTab}
        feedStatus={feedStatus} onSettings={() => setShowSettings(true)} theme={theme} toggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
      {editable && (
        <div className="scenario-bar">
          <Describe ctx={ctx} onAdd={onAdd} />
          <button className="btn ghost" onClick={() => setShowCompare(true)}>Compare scenarios</button>
        </div>
      )}
      <div className="body">
        {wlOpen ? (
          <Watchlist entries={visible} selectedId={selectedId} onSelect={select} ctx={ctx} focus={focus} setFocus={setFocus} commodities={commodities} setCommodities={setCommodities} families={families} setFamilies={setFamilies} readIds={readIds} onCollapse={() => setWlOpen(false)} />
        ) : (
          <button className="edge-toggle left" onClick={() => setWlOpen(true)} title="Show watchlist and filters"><span className="chev">›</span><span className="edge-lbl">Watchlist</span></button>
        )}
        <ErrorBoundary label="Map"><MapView entries={visible} selectedId={selectedId} onSelect={select} theme={theme} ctx={ctx} focus={focus} /></ErrorBoundary>
        {drawerOpen && selectedEntry ? (
          <ErrorBoundary label="Analysis"><Drawer entry={selectedEntry} ctx={ctx} focus={focus} tab={tab} editable={editable} onDial={onDial} onRemove={onRemove} onCollapse={() => setDrawerOpen(false)} /></ErrorBoundary>
        ) : selectedEntry ? (
          <button className="edge-toggle right" onClick={() => setDrawerOpen(true)} title="Show analysis"><span className="chev">‹</span><span className="edge-lbl">Analysis</span></button>
        ) : null}
      </div>
      {showCompare && <Compare ctx={ctx} tabs={tabs} base={base} entriesFor={entriesFor} focus={focus} onClose={() => setShowCompare(false)} />}
      {showSettings && <Settings settings={settings} onSave={setSettings} onClose={() => setShowSettings(false)} focusLabel={fLabel} />}
    </div>
  );
}
