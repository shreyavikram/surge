const UA = 'SURGE/0.1 (agro-defense readiness prototype)';

export async function httpText(url: string, timeoutMs = 20000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': UA, accept: '*/*' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function httpJson<T = unknown>(url: string, timeoutMs = 20000): Promise<T> {
  return JSON.parse(await httpText(url, timeoutMs)) as T;
}

/** YYYY-MM-DD in UTC. */
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
