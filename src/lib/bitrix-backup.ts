// Full Bitrix24 backup to Google Drive: every lead with its activities, timeline comments, stage history and people,
// read through the saved Bitrix sync link, saved as an Excel file (easy to open) plus a complete raw copy
// (.json.gz, every Bitrix field including custom ones). Daily, into "AMS backups / Bitrix backups"; old ones are
// removed after the backup's keep-days. Read-only for Bitrix.
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createGzip } from "node:zlib";
import { format } from "date-fns";
import ExcelJS from "exceljs";
import { db } from "./db";
import { openSecret } from "./softphone";

const KEY = "bitrix.backup";
export type BitrixBackupState = { enabled: boolean; lastAt: string | null; lastOk: boolean | null; message: string | null; leads?: number; sizeMb?: number };

const g = globalThis as unknown as { __bxBackup?: { running: boolean; step: string } };
const live = () => (g.__bxBackup ??= { running: false, step: "" });

export async function bitrixBackupState(): Promise<BitrixBackupState & { running: boolean; step: string }> {
  const raw = (await db.setting.findUnique({ where: { key: KEY } }))?.value;
  const s = raw ? (JSON.parse(raw) as Partial<BitrixBackupState>) : {};
  return { enabled: s.enabled ?? true, lastAt: s.lastAt ?? null, lastOk: s.lastOk ?? null, message: s.message ?? null, leads: s.leads, sizeMb: s.sizeMb, running: live().running, step: live().step };
}
async function save(patch: Partial<BitrixBackupState>) {
  const s = await bitrixBackupState();
  const cur: BitrixBackupState = { enabled: s.enabled, lastAt: s.lastAt, lastOk: s.lastOk, message: s.message, leads: s.leads, sizeMb: s.sizeMb };
  const value = JSON.stringify({ ...cur, ...patch });
  await db.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
}
export const setBitrixBackup = (enabled: boolean) => save({ enabled });

/** Daily: when switched on, Bitrix is connected, Drive is connected and the last good one is 20+ hours old. */
export async function bitrixBackupIfDue() {
  const s = await bitrixBackupState();
  if (!s.enabled || s.running) return false;
  if (s.lastAt && s.lastOk && Date.now() - +new Date(s.lastAt) < 20 * 3600_000) return false;
  if (s.lastAt && !s.lastOk && Date.now() - +new Date(s.lastAt) < 3 * 3600_000) return false; // failed: retry in a few hours
  const [{ syncConfig }, { driveConnected }] = await Promise.all([import("./bitrix-sync"), import("./backup")]);
  if (!(await syncConfig()).sealed || !(await driveConnected())) return false;
  await runBitrixBackup();
  return true;
}

export async function runBitrixBackup(): Promise<{ ok: boolean; message: string }> {
  const st = live();
  if (st.running) return { ok: false, message: "A Bitrix backup is already running." };
  st.running = true; st.step = "Starting…";
  const dir = await mkdtemp(path.join(tmpdir(), "bitrix-backup-"));
  const at = new Date();
  try {
    const { syncConfig } = await import("./bitrix-sync");
    const url = openSecret((await syncConfig()).sealed);
    if (!url) throw new Error("Bitrix isn't connected. Connect it on this page first (Bitrix sync).");
    const { fetchFromBitrix } = await import("./bitrix-api");
    const data = await fetchFromBitrix(url, (step) => { st.step = step; });
    st.step = "Writing the Excel file…";
    const stamp = format(at, "yyyy-MM-dd_HHmm");
    const xlsx = path.join(dir, "bitrix.xlsx");
    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: xlsx, useStyles: true });
    const sheet = (name: string, rows: Record<string, string>[]) => {
      const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      ws.columns = cols.map((k) => ({ header: k, key: k, width: Math.min(60, Math.max(12, k.length + 2)) }));
      ws.getRow(1).font = { bold: true };
      for (const r of rows) ws.addRow(r).commit();
      ws.commit();
    };
    sheet("Leads", data.leads);
    sheet("Activities", data.activities);
    sheet("Comments", data.comments);
    sheet("Stage history", data.history);
    sheet("People", data.raw.users.map((u) => Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v == null ? "" : String(v)]))));
    await wb.commit();
    st.step = "Writing the complete copy…";
    const gz = path.join(dir, "bitrix.json.gz");
    const json = JSON.stringify({ exportedAt: at.toISOString(), leads: data.raw.leads, activities: data.raw.activities, comments: data.comments, stageHistory: data.raw.history, users: data.raw.users });
    await pipeline(Readable.from([json]), createGzip(), createWriteStream(gz));
    st.step = "Uploading to Google Drive…";
    const { uploadToBackupFolder } = await import("./backup");
    const a = await uploadToBackupFolder(xlsx, `bitrix-leads-${stamp}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Bitrix backups");
    const b = await uploadToBackupFolder(gz, `bitrix-full-${stamp}.json.gz`, "application/gzip", "Bitrix backups");
    const sizeMb = Math.round(((a.size + b.size) / 1024 / 1024) * 10) / 10;
    const message = `${data.leads.length.toLocaleString()} leads, ${data.activities.length.toLocaleString()} activities, ${data.comments.length.toLocaleString()} comments, ${data.history.length.toLocaleString()} stage changes saved to Google Drive (${sizeMb < 0.1 ? "under 0.1" : sizeMb} MB).`;
    await save({ lastAt: at.toISOString(), lastOk: true, message, leads: data.leads.length, sizeMb });
    return { ok: true, message };
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 400) : "Bitrix backup failed.";
    await save({ lastAt: at.toISOString(), lastOk: false, message });
    const { notify } = await import("./notify");
    for (const u of await db.user.findMany({ where: { isSuperAdmin: true, active: true }, select: { id: true } })) {
      await notify(u.id, "⚠️ Bitrix backup failed", { body: message.slice(0, 300), link: "/settings/bitrix-sync" }).catch(() => {});
    }
    return { ok: false, message };
  } finally {
    st.running = false; st.step = "";
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
