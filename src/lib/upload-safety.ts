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
  add((await q(() => db.projectImage.findMany({ select: { path: true } }))).map((r) => ({ p: r.path })), "Project photo");
  add((await q(() => db.finPayable.findMany({ where: { proof: { not: null } }, select: { proof: true } }))).map((r) => ({ p: r.proof })), "Supplier bill");
  add((await q(() => db.attendancePunch.findMany({ where: { photo: { not: null } }, select: { photo: true }, orderBy: { at: "desc" }, take: 3000 }))).map((r) => ({ p: r.photo })), "Check-in selfie");
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
 * Brings back missing files from the Google Drive backups: the newest files zip first, then older ones, until every
 * missing picture / bill is found (files lost by an old deploy are only in backups made before it). Only missing
 * files are written, nothing is overwritten; at most `maxZips` zips are opened.
 */
export async function restoreMissingFromBackup(maxZips = 15) {
  const { driveFileStream, filesZips } = await import("./backup");
  const zips = await filesZips(maxZips).catch((e: Error) => { throw e; });
  if (!zips.length) return { error: "No backup with files was found in Google Drive (Settings → Backup → include files)." };
  const want = new Set((await missingUploads()).missing.map((m) => m.path.replace(/^\/+/, "")));
  // Also bring back the small preview picture of PDFs made from photos.
  for (const p of [...want]) if (/\.pdf$/i.test(p)) want.add(p.replace(/\.pdf$/i, ".preview.jpg"));
  if (!want.size) return { ok: true as const, restored: 0, from: "nothing missing" };
  const unzipper = await import("unzipper");
  let restored = 0;
  const used: string[] = [];
  for (const zip of zips) {
    if (!want.size) break;
    const dir = path.join(tmpdir(), `ams-restore-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, "files.zip");
    try {
      await pipeline(Readable.fromWeb(await driveFileStream(zip.id) as import("node:stream/web").ReadableStream), createWriteStream(file));
      const archive = await unzipper.Open.file(file);
      let here = 0;
      for (const entry of archive.files) {
        const rel = entry.path.replace(/^\/+/, "");
        if (entry.type !== "File" || !want.has(rel)) continue;
        const abs = resolveUpload(rel);
        if (!abs || existsSync(abs)) { want.delete(rel); continue; }
        await mkdir(path.dirname(abs), { recursive: true });
        await pipeline(entry.stream(), createWriteStream(abs));
        want.delete(rel); restored++; here++;
      }
      if (here) used.push(zip.name);
    } catch (e) { console.error(`Restoring from ${zip.name} failed:`, e); }
    finally { const { rm } = await import("node:fs/promises"); await rm(dir, { recursive: true, force: true }).catch(() => {}); }
  }
  return { ok: true as const, restored, still: [...want].filter((p) => !p.endsWith(".preview.jpg")).length, from: used.join(", ") || "no backup had them" };
}

/** At start-up: if pictures / bills are missing and Google Drive backup is connected, restore them in the background. */
export async function autoRestoreMissing() {
  const { missing } = await missingUploads();
  if (!missing.length) return null;
  const r = await restoreMissingFromBackup().catch((e) => ({ error: String(e) }));
  console.log(`Missing files: ${missing.length}; restore:`, r);
  return r;
}
