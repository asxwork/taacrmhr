// Daily backup to Google Drive: the whole database as gzipped JSON (works the same on MySQL and SQLite), plus the
// uploaded files as a zip when switched on. Keeps the last N days (default 30) in an "AMS backups" Drive folder.
// Google access uses the admin's own account (OAuth, scope drive.file: AMS only sees files it created).
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { createGzip } from "node:zlib";
import { format, subDays } from "date-fns";
import archiver from "archiver";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { APP_URL } from "./notify";
import { UPLOAD_ROOT } from "./files";
import { openSecret, sealSecret } from "./softphone";

const SETTING = "backup.google";
export type BackupConfig = {
  clientId?: string; clientSecret?: string | null; refreshToken?: string | null; email?: string | null;
  folderId?: string | null; includeFiles?: boolean; keepDays?: number;
};
type Stored = Omit<BackupConfig, "clientSecret" | "refreshToken"> & { secretSealed?: string | null; tokenSealed?: string | null };

export const redirectUri = () => `${APP_URL()}/api/backup/google/callback`;

export async function backupConfig(): Promise<BackupConfig> {
  const row = await db.setting.findUnique({ where: { key: SETTING } });
  let s: Stored = {};
  try { s = row ? JSON.parse(row.value) : {}; } catch {}
  return { ...s, clientSecret: openSecret(s.secretSealed ?? null), refreshToken: openSecret(s.tokenSealed ?? null), keepDays: s.keepDays || 30, includeFiles: !!s.includeFiles };
}

export async function saveBackupConfig(patch: BackupConfig) {
  const cur = await backupConfig();
  const next = { ...cur, ...patch };
  const stored: Stored = {
    clientId: next.clientId, email: next.email, folderId: next.folderId, includeFiles: next.includeFiles, keepDays: next.keepDays,
    secretSealed: next.clientSecret ? sealSecret(next.clientSecret) : null, tokenSealed: next.refreshToken ? sealSecret(next.refreshToken) : null,
  };
  await db.setting.upsert({ where: { key: SETTING }, update: { value: JSON.stringify(stored) }, create: { key: SETTING, value: JSON.stringify(stored) } });
}

// ─── Google Drive (plain REST, no SDK) ───────────────────────

export function googleAuthUrl(clientId: string, state: string) {
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri(), response_type: "code", access_type: "offline", prompt: "consent", state,
    scope: "https://www.googleapis.com/auth/drive.file openid email",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export async function exchangeCode(code: string) {
  const c = await backupConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: c.clientId ?? "", client_secret: c.clientSecret ?? "", redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  const j = (await res.json()) as { refresh_token?: string; id_token?: string; error_description?: string; error?: string };
  if (!res.ok || !j.refresh_token) throw new Error(j.error_description || j.error || "Google didn't return a refresh token — remove AMS from your Google account's third-party access and connect again.");
  let email: string | null = null;
  try { email = JSON.parse(Buffer.from(j.id_token!.split(".")[1]!, "base64url").toString()).email ?? null; } catch {}
  await saveBackupConfig({ refreshToken: j.refresh_token, email, folderId: null });
}

async function accessToken(c: BackupConfig) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId ?? "", client_secret: c.clientSecret ?? "", refresh_token: c.refreshToken ?? "", grant_type: "refresh_token" }),
  });
  const j = (await res.json()) as { access_token?: string; error_description?: string; error?: string };
  if (!j.access_token) throw new Error(`Google sign-in failed: ${String(j.error_description || j.error || res.status).replace(/\.$/, "")}. Reconnect Google Drive in Settings → Backup.`);
  return j.access_token;
}

async function drive(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`Google Drive: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res;
}

async function ensureFolder(token: string, c: BackupConfig) {
  if (c.folderId) {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${c.folderId}?fields=id,trashed`, { headers: { authorization: `Bearer ${token}` } });
    if (r.ok && !((await r.json()) as { trashed?: boolean }).trashed) return c.folderId;
  }
  const res = await drive(token, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "AMS backups", mimeType: "application/vnd.google-apps.folder" }),
  });
  const id = ((await res.json()) as { id: string }).id;
  await saveBackupConfig({ folderId: id });
  return id;
}

async function upload(token: string, folderId: string, file: string, name: string, mime: string) {
  const size = (await stat(file)).size;
  const start = await drive(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", {
    method: "POST", headers: { "content-type": "application/json", "x-upload-content-type": mime, "x-upload-content-length": String(size) },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  const session = start.headers.get("location")!;
  const res = await fetch(session, {
    method: "PUT", headers: { "content-type": mime, "content-length": String(size) },
    body: Readable.toWeb(createReadStream(file)) as ReadableStream, duplex: "half",
  } as RequestInit & { duplex: "half" });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return { id: ((await res.json()) as { id: string }).id, size };
}

/** Deletes backups in the folder older than keepDays (always keeping the newest few). */
async function prune(token: string, folderId: string, keepDays: number) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await drive(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime)&orderBy=createdTime desc&pageSize=1000`);
  const files = ((await res.json()) as { files: { id: string; createdTime: string }[] }).files;
  const cutoff = subDays(new Date(), keepDays);
  let removed = 0;
  for (const f of files.slice(2)) if (new Date(f.createdTime) < cutoff) { await drive(token, `https://www.googleapis.com/drive/v3/files/${f.id}`, { method: "DELETE" }); removed++; }
  return removed;
}

// ─── The dump ────────────────────────────────────────────────

/** Writes every table to a gzipped JSON file, 2,000 rows at a time. */
export async function dumpDatabase(file: string) {
  const out = createGzip();
  const done = new Promise<void>((ok, fail) => { out.pipe(createWriteStream(file)).on("finish", ok).on("error", fail); });
  const write = (s: string) => new Promise<void>((ok) => { if (out.write(s)) ok(); else out.once("drain", ok); });
  await write(`{"version":1,"createdAt":${JSON.stringify(new Date().toISOString())},"models":{`);
  const models = Prisma.dmmf.datamodel.models;
  for (const [i, m] of models.entries()) {
    const delegate = (db as unknown as Record<string, { findMany: (a: object) => Promise<object[]> }>)[m.name[0]!.toLowerCase() + m.name.slice(1)];
    const keys = m.primaryKey?.fields ?? m.fields.filter((f) => f.isId).map((f) => f.name);
    await write(`${i ? "," : ""}${JSON.stringify(m.name)}:[`);
    let first = true;
    for (let skip = 0; ; skip += 2000) {
      const rows = await delegate.findMany({ skip, take: 2000, ...(keys.length ? { orderBy: keys.map((k) => ({ [k]: "asc" })) } : {}) });
      for (const r of rows) { await write(`${first ? "" : ","}${JSON.stringify(r)}`); first = false; }
      if (rows.length < 2000) break;
    }
    await write("]");
  }
  await write("}}");
  out.end();
  await done;
}

async function zipUploads(file: string) {
  await new Promise<void>((ok, fail) => {
    const zip = archiver("zip", { zlib: { level: 6 } });
    const stream = createWriteStream(file);
    stream.on("close", ok);
    zip.on("error", fail);
    zip.pipe(stream);
    zip.directory(UPLOAD_ROOT, false);
    void zip.finalize();
  });
}

/** One full backup run. Records the outcome in BackupRun; never throws. */
export async function runBackup(trigger: "auto" | "manual") {
  if (await db.backupRun.findFirst({ where: { status: "running", startedAt: { gte: new Date(Date.now() - 30 * 60_000) } } })) return { skipped: "A backup is already running." };
  const run = await db.backupRun.create({ data: { trigger } });
  const dir = await mkdtemp(path.join(tmpdir(), "ams-backup-"));
  try {
    const c = await backupConfig();
    if (!c.clientId || !c.clientSecret || !c.refreshToken) throw new Error("Google Drive isn't connected (Settings → Backup).");
    const stamp = format(new Date(), "yyyy-MM-dd_HHmm");
    const dbFile = path.join(dir, `ams-database-${stamp}.json.gz`);
    await dumpDatabase(dbFile);
    const token = await accessToken(c);
    const folderId = await ensureFolder(token, c);
    const up = await upload(token, folderId, dbFile, path.basename(dbFile), "application/gzip");
    let size = up.size;
    if (c.includeFiles) {
      const zipFile = path.join(dir, `ams-uploads-${stamp}.zip`);
      await zipUploads(zipFile);
      size += (await upload(token, folderId, zipFile, path.basename(zipFile), "application/zip")).size;
    }
    await prune(token, folderId, c.keepDays ?? 30);
    await db.backupRun.update({ where: { id: run.id }, data: { status: "ok", fileName: path.basename(dbFile), sizeBytes: size, driveFileId: up.id, finishedAt: new Date() } });
    return { ok: true };
  } catch (e) {
    await db.backupRun.update({ where: { id: run.id }, data: { status: "failed", error: (e as Error).message.slice(0, 2000), finishedAt: new Date() } });
    return { error: (e as Error).message };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Daily job: back up if Drive is connected and there's no successful backup in the last 20 hours. */
export async function backupIfDue() {
  const c = await backupConfig();
  if (!c.refreshToken) return false;
  if (await db.backupRun.findFirst({ where: { status: "ok", startedAt: { gte: new Date(Date.now() - 20 * 3600_000) } } })) return false;
  await runBackup("auto");
  return true;
}
