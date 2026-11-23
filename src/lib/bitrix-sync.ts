// Keeps AMS in step with Bitrix24 while both are in use: every few minutes it reads what changed in Bitrix since the
// last run (new leads, leads whose stage / responsible person / details changed, new activities, comments and stage
// changes) and brings it in. Bitrix → AMS only; nothing in Bitrix is changed. The webhook link is stored encrypted.
import { db } from "./db";
import { canStoreSecrets, openSecret, sealSecret } from "./softphone";
import { disabledFeatures } from "./features";

const KEY = "bitrix.sync";
export { SYNC_EVERY } from "./bitrix-sync-shared";

export type SyncResult = { at: string; ok: boolean; message: string; newLeads?: number; updated?: number; activities?: number; comments?: number; history?: number; unmatched?: string[]; seconds?: number };
export type SyncConfig = { sealed: string | null; enabled: boolean; every: number; last: string | null; userId: string | null; owners: Record<string, string>; result: SyncResult | null; portal: string | null };

const g = globalThis as unknown as { __bxSync?: { running: boolean; step: string; lastTry: number } };
const state = () => (g.__bxSync ??= { running: false, step: "", lastTry: 0 });

export async function syncConfig(): Promise<SyncConfig> {
  const raw = (await db.setting.findUnique({ where: { key: KEY } }))?.value;
  const c = raw ? (JSON.parse(raw) as Partial<SyncConfig>) : {};
  return { sealed: c.sealed ?? null, enabled: !!c.enabled, every: Number(c.every) || 15, last: c.last ?? null, userId: c.userId ?? null, owners: c.owners ?? {}, result: c.result ?? null, portal: c.portal ?? null };
}
async function save(c: SyncConfig) {
  const value = JSON.stringify(c);
  await db.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
}

/** What the page shows (never the link itself). */
export async function syncStatus() {
  const c = await syncConfig();
  const s = state();
  return { connected: !!c.sealed, portal: c.portal, enabled: c.enabled, every: c.every, last: c.last, result: c.result, running: s.running, step: s.step, canStore: canStoreSecrets() };
}

/**
 * Save the link and turn sync on. `last`: the moment everything up to was already imported (right after a full
 * import); null makes the first sync read everything (safe: what's already in AMS is updated, not added twice).
 */
export async function connectSync(webhook: string, opts: { userId: string; every?: number; last?: Date | null; owners?: Record<string, string> }) {
  const sealed = sealSecret(webhook);
  if (!sealed) throw new Error("The server has no secret key to store the link safely (set SIP_SECRET_KEY or CRON_SECRET in the hosting settings).");
  const c = await syncConfig();
  const owners = Object.fromEntries(Object.entries(opts.owners ?? c.owners).filter(([, v]) => v && !v.startsWith("__")));
  await save({ ...c, sealed, enabled: true, every: opts.every ?? c.every, last: opts.last === undefined ? c.last : opts.last ? opts.last.toISOString() : null, userId: opts.userId, owners, portal: new URL(webhook).hostname });
}

export async function updateSync(patch: Partial<Pick<SyncConfig, "enabled" | "every">> & { disconnect?: boolean }) {
  const c = await syncConfig();
  if (patch.disconnect) return save({ ...c, sealed: null, enabled: false, portal: null });
  await save({ ...c, ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}), ...(patch.every ? { every: patch.every } : {}) });
}

/** Called while people use AMS (and by the cron): runs a sync when one is due, in the background. */
export function maybeRunBitrixSync() {
  const s = state();
  if (s.running || Date.now() - s.lastTry < 60_000) return;
  s.lastTry = Date.now();
  // The daily Bitrix backup to Google Drive is checked on the same tick.
  void disabledFeatures().then((off) => { if (!off.has("crm-bitrix-backup") && !off.has("app-crm")) return import("./bitrix-backup").then((m) => m.bitrixBackupIfDue()); }).catch((e) => console.error("Bitrix backup failed:", e));
  void Promise.all([syncConfig(), disabledFeatures()]).then(([c, off]) => {
    if (!c.enabled || !c.sealed || off.has("crm-bitrix-sync") || off.has("app-crm")) return;
    if (c.last && Date.now() - +new Date(c.last) < c.every * 60_000) return;
    return runBitrixSync();
  }).catch((e) => console.error("Bitrix sync failed:", e));
}

export async function runBitrixSync(opts: { full?: boolean } = {}): Promise<SyncResult> {
  const s = state();
  if (s.running) return { at: new Date().toISOString(), ok: false, message: "A sync is already running." };
  s.running = true; s.step = "Starting…";
  const t0 = Date.now();
  const startedAt = new Date();
  let c = await syncConfig();
  let result: SyncResult;
  try {
    const url = openSecret(c.sealed);
    if (!url) throw new Error("No Bitrix link saved (or the server's secret key changed). Connect again.");
    const userId = c.userId && (await db.user.findUnique({ where: { id: c.userId }, select: { id: true } })) ? c.userId : (await db.user.findFirst({ where: { isSuperAdmin: true, active: true }, select: { id: true } }))?.id;
    if (!userId) throw new Error("No Super Admin to run the sync as.");
    const { fetchFromBitrix } = await import("./bitrix-api");
    const { importBitrix } = await import("./bitrix-import");
    const files = await fetchFromBitrix(url, (step) => { s.step = step; }, { since: opts.full || !c.last ? null : new Date(c.last) });
    s.step = "Saving in AMS…";
    const r = await importBitrix(files, { deleteDemo: false, userId, owners: c.owners, update: true, sync: true });
    result = {
      at: startedAt.toISOString(), ok: true, seconds: Math.round((Date.now() - t0) / 1000),
      newLeads: r.leads, updated: r.updated, activities: r.activities, comments: r.comments, history: r.history, unmatched: r.unmatched,
      message: r.leads + r.updated + r.activities + r.comments + r.history === 0 ? "Up to date: nothing new in Bitrix." : `${r.leads} new leads, ${r.updated} updated, ${r.activities} activities, ${r.comments} comments, ${r.history} stage changes${r.failed ? ` (${r.failed} rows failed)` : ""}.`,
    };
    c = await syncConfig(); // settings may have changed while it ran
    await save({ ...c, last: startedAt.toISOString(), result });
  } catch (e) {
    result = { at: startedAt.toISOString(), ok: false, seconds: Math.round((Date.now() - t0) / 1000), message: e instanceof Error ? e.message.slice(0, 300) : "Sync failed." };
    c = await syncConfig();
    await save({ ...c, result }); // `last` stays, so the next run picks up from the same point
  } finally {
    s.running = false; s.step = "";
  }
  return result;
}
