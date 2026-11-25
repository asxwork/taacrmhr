// Keeps uploads safe across deploys: moves files from the old folder inside the app into the permanent one, checks
// which saved pictures/files have lost their file, and brings missing files back from the latest Google Drive backup.
import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { db } from "./db";
import { OLD_UPLOAD_ROOT, UPLOAD_ROOT, resolveUpload } from "./files";

/** On start: copy whatever is still in the old in-app folder into the permanent folder (never overwrites). */
export async function moveOldUploads() {
  if (OLD_UPLOAD_ROOT === UPLOAD_ROOT || !existsSync(OLD_UPLOAD_ROOT)) return 0;
  const before = await countFiles(UPLOAD_ROOT);
  await cp(OLD_UPLOAD_ROOT, UPLOAD_ROOT, { recursive: true, force: false, errorOnExist: false }).catch((e) => console.error("Moving old uploads failed:", e));
  return (await countFiles(UPLOAD_ROOT)) - before;
}

async function countFiles(dir: string): Promise<number> {
  const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
  let n = 0;
  for (const it of items) n += it.isDirectory() ? (it.name === ".thumbs" ? 0 : await countFiles(path.join(dir, it.name))) : 1;
  return n;
}

/** Every saved picture/file path in the database, with what it belongs to. */
async function referencedFiles() {
  const rows: { path: string; what: string }[] = [];
  const add = (list: { p: string | null }[], what: string) => { for (const r of list) if (r.p) rows.push({ path: r.p, what }); };
  const q = async <T,>(f: () => Promise<T[]>) => f().catch(() => [] as T[]);
  add((await q(() => db.employee.findMany({ where: { photo: { not: null } }, select: { photo: true } }))).map((r) => ({ p: r.photo })), "Employee photo");
  add((await q(() => db.finProof.findMany({ select: { path: true } }))).map((r) => ({ p: r.path })), "Finance bill / receipt");
  add((await q(() => db.finEntry.findMany({ where: { receipt: { not: null } }, select: { receipt: true } }))).map((r) => ({ p: r.receipt })), "Finance receipt");
  add((await q(() => db.unitImage.findMany({ select: { path: true } }))).map((r) => ({ p: r.path })), "Unit photo");
  add((await q(() => db.employeeDocument.findMany({ select: { path: true } }))).map((r) => ({ p: r.path })), "Employee document");
  add((await q(() => db.expense.findMany({ where: { receipt: { not: null } }, select: { receipt: true } }))).map((r) => ({ p: r.receipt })), "Expense claim receipt");
  return rows.filter((r) => !/^https?:/i.test(r.path));
}

/** Saved pictures/files whose file isn't on the server. */
export async function missingUploads() {
  const refs = await referencedFiles();
  const missing: typeof refs = [];
  for (const r of refs) { const abs = resolveUpload(r.path); if (!abs || !(await stat(abs).catch(() => null))) missing.push(r); }
  return { total: refs.length, missing };
}

/**
 * Brings back missing files from the newest Google Drive backup that has a files zip: only files that aren't on
 * the server are written (nothing is overwritten).
 */
export async function restoreMissingFromBackup() {
  const { driveFileStream, latestFilesZip } = await import("./backup");
  const zip = await latestFilesZip();
  if (!zip) return { error: "No backup with files was found in Google Drive (Settings → Backup → include files)." };
  const dir = path.join(tmpdir(), `ams-restore-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "files.zip");
  await pipeline(Readable.fromWeb(await driveFileStream(zip.id) as import("node:stream/web").ReadableStream), createWriteStream(file));
  const unzipper = await import("unzipper");
  const archive = await unzipper.Open.file(file);
  let restored = 0;
  for (const entry of archive.files) {
    if (entry.type !== "File" || entry.path.includes(".thumbs/")) continue;
    const abs = resolveUpload(entry.path.replace(/^\/+/, ""));
    if (!abs || existsSync(abs)) continue;
    await mkdir(path.dirname(abs), { recursive: true });
    await pipeline(entry.stream(), createWriteStream(abs));
    restored++;
  }
  const { rm } = await import("node:fs/promises");
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  return { ok: true as const, restored, from: zip.name };
}
