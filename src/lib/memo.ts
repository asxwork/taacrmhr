// Small in-process cache for data read on every request (session user, settings, pipelines).
// Entries are dropped by TTL and, more importantly, whenever the underlying tables are written
// (see the write hook in db.ts), so changes show up on the next request.

type Entry = { at: number; ttl: number; value: Promise<unknown> };

const g = globalThis as unknown as { __memo?: Map<string, Entry> };
const store = (g.__memo ??= new Map());

export function memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { at: Date.now(), ttl: ttlMs, value });
  value.catch(() => store.get(key)?.value === value && store.delete(key));
  if (store.size > 2000) store.delete(store.keys().next().value!);
  return value;
}

/** Drops every entry whose key starts with `prefix`. */
export function forget(prefix: string) {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
