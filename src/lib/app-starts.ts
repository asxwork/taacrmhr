// Records each time the server process starts, so System health can show restarts (a host stopping or killing the
// app makes the next click wait for a cold start, which feels like a hang).
import { db } from "./db";

const KEY = "app.starts";

export async function recordStart() {
  const row = await db.setting.findUnique({ where: { key: KEY } }).catch(() => null);
  let list: string[] = [];
  try { list = row ? JSON.parse(row.value) : []; } catch {}
  list = [new Date().toISOString(), ...list].slice(0, 60);
  await db.setting.upsert({ where: { key: KEY }, update: { value: JSON.stringify(list) }, create: { key: KEY, value: JSON.stringify(list) } }).catch(() => {});
}

export async function recentStarts(hours = 24) {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  let list: string[] = [];
  try { list = row ? JSON.parse(row.value) : []; } catch {}
  const since = Date.now() - hours * 3600_000;
  return list.map((s) => new Date(s)).filter((d) => +d >= since);
}
