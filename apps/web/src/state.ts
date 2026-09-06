import { useCallback, useEffect, useState } from 'react';
import type { Threat } from '@surge/engine';

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function write(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }

/** A scenario tab: the live picture plus per-threat dials, removals, and added hypothetical threats. */
export interface TabDef {
  id: string;
  name: string;
  overrides: Record<string, { severity?: number; months?: number }>;
  added: Threat[];
  removed: string[];
  createdAt: string;
  updatedAt: string;
}
export const LIVE_TAB: TabDef = { id: 'live', name: 'Live', overrides: {}, added: [], removed: [], createdAt: '', updatedAt: '' };

export function useTabs() {
  const [tabs, setTabs] = useState<TabDef[]>(() => read<TabDef[]>('surge-tabs', []));
  useEffect(() => write('surge-tabs', tabs), [tabs]);
  const create = useCallback((name: string, from?: TabDef): TabDef => {
    const now = new Date().toISOString();
    const t: TabDef = { id: `tab-${Date.now()}`, name, overrides: { ...(from?.overrides ?? {}) }, added: [...(from?.added ?? [])], removed: [...(from?.removed ?? [])], createdAt: now, updatedAt: now };
    setTabs((p) => [...p, t]);
    return t;
  }, []);
  const update = useCallback((id: string, patch: (t: TabDef) => TabDef) => setTabs((p) => p.map((t) => (t.id === id ? { ...patch(t), updatedAt: new Date().toISOString() } : t))), []);
  const remove = useCallback((id: string) => setTabs((p) => p.filter((t) => t.id !== id)), []);
  const rename = useCallback((id: string, name: string) => update(id, (t) => ({ ...t, name })), [update]);
  return { tabs, create, update, remove, rename };
}

export interface Focus { kind: 'us' | 'state' | 'district'; ids: string[] }
function migrateFocus(f: unknown): Focus {
  const o = (f ?? {}) as { kind?: Focus['kind']; id?: string; ids?: string[] };
  if (!o.kind || o.kind === 'us') return { kind: 'us', ids: [] };
  return { kind: o.kind, ids: o.ids ?? (o.id ? [o.id] : []) };
}
export function useFocus() {
  const [focus, setFocus] = useState<Focus>(() => migrateFocus(read<unknown>('surge-focus', { kind: 'us', ids: [] })));
  useEffect(() => write('surge-focus', focus), [focus]);
  return { focus, setFocus };
}

/** Threats the viewer has opened; everything else shows an unread badge. */
export function useRead() {
  const [read_, setRead] = useState<string[]>(() => read<string[]>('surge-read', []));
  useEffect(() => write('surge-read', read_), [read_]);
  const markRead = useCallback((id: string) => setRead((p) => (p.includes(id) ? p : [...p, id])), []);
  return { readIds: new Set(read_), markRead };
}

export interface Settings { email: string; alerts: boolean; theme: 'dark' | 'light'; basemap?: 'simple' | 'tiles'; frequency?: 'immediate' | 'weekly' | 'monthly' }
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => read<Settings>('surge-settings', { email: '', alerts: false, theme: 'dark' }));
  useEffect(() => write('surge-settings', settings), [settings]);
  return { settings, setSettings };
}
