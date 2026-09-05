import { useEffect, useState } from 'react';
import type { Scenario } from '@surge/engine';

const KEY = 'surge-scenarios';

function load(): Scenario[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Scenario[]) : [];
  } catch {
    return [];
  }
}

/** Saved simulator scenarios, persisted per-viewer in localStorage. */
export function useScenarios() {
  const [scenarios, setScenarios] = useState<Scenario[]>(load);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(scenarios)); } catch { /* ignore */ }
  }, [scenarios]);

  const save = (s: Scenario) => setScenarios((prev) => [...prev.filter((x) => x.id !== s.id), s]);
  const remove = (id: string) => setScenarios((prev) => prev.filter((x) => x.id !== id));

  return { scenarios, save, remove };
}
