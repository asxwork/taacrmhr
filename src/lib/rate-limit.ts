// Failed-login throttle. In memory: the app runs as one Node process on Hostinger, and a restart
// only resets the counters (it never locks anyone out for longer).
const WINDOW_MS = 15 * 60_000;
const LIMITS = { email: 5, ip: 20 };
const failures = new Map<string, number[]>();

const recent = (key: string) => {
  const now = Date.now();
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
};

/** Minutes until this email/IP may try again, or 0 when allowed. */
export function loginBlockedFor(email: string, ip: string) {
  const blocked = (key: string, limit: number) => {
    const list = recent(key);
    return list.length >= limit ? Math.ceil((list[0]! + WINDOW_MS - Date.now()) / 60_000) : 0;
  };
  return Math.max(blocked(`e:${email}`, LIMITS.email), blocked(`i:${ip}`, LIMITS.ip));
}

export function recordLoginFailure(email: string, ip: string) {
  for (const key of [`e:${email}`, `i:${ip}`]) failures.set(key, [...recent(key), Date.now()]);
  if (failures.size > 10_000) failures.clear(); // never grow without bound
}

export function clearLoginFailures(email: string) {
  failures.delete(`e:${email}`);
}
