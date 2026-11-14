// Daily backup to Google Drive: the whole database as gzipped JSON (works the same on MySQL and SQLite), plus the
// uploaded files as a zip when switched on. Keeps the last N days (default 30) in an "AMS backups" Drive folder.
// Google access uses the admin's own account (OAuth, scope drive.file: AMS only sees files it created).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
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

// Server keys: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (/ GOOGLE_REFRESH_TOKEN), or the short names G_CLIENT_ID /
// G_CLIENT_SECRET (/ G_REFRESH_TOKEN). Either works.
const env = {
  id: (): string => process.env.GOOGLE_CLIENT_ID || process.env.G_CLIENT_ID || "",
  secret: (): string => process.env.GOOGLE_CLIENT_SECRET || process.env.G_CLIENT_SECRET || "",
  refresh: (): string => process.env.GOOGLE_REFRESH_TOKEN || process.env.G_REFRESH_TOKEN || "",
};
export type BackupConfig = {
  clientId?: string; clientSecret?: string | null; refreshToken?: string | null; email?: string | null;
  folderId?: string | null; includeFiles?: boolean; keepDays?: number;
};
type Stored = Omit<BackupConfig, "clientSecret" | "refreshToken"> & { secretSealed?: string | null; tokenSealed?: string | null };

export const redirectUri = () => `${APP_URL()}/api/backup/google/callback`;

// The Google sign-in (refresh token) is locked with a key made from GOOGLE_CLIENT_SECRET, which stays the same across
// redeploys, so the connection survives. Without server keys it falls back to the app secret (SIP_SECRET_KEY / CRON_SECRET).
const driveKey = () => (env.secret() ? createHash("sha256").update(`gdrive:${env.secret()}`).digest() : null);
function sealToken(plain: string) {
  const k = driveKey();
  if (!k) return sealSecret(plain);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `g1.${[iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".")}`;
}
function openToken(sealed: string | null | undefined) {
  if (!sealed) return null;
  if (!sealed.startsWith("g1.")) return openSecret(sealed);
  const k = driveKey();
  if (!k) return null;
  try {
    const [iv, tag, enc] = sealed.slice(3).split(".").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv("aes-256-gcm", k, iv!);
    d.setAuthTag(tag!);
    return Buffer.concat([d.update(enc!), d.final()]).toString("utf8");
  } catch { return null; }
}

export async function backupConfig(): Promise<BackupConfig> {
  const row = await db.setting.findUnique({ where: { key: SETTING } });
  let s: Stored = {};
  try { s = row ? JSON.parse(row.value) : {}; } catch {}
  // The app's Google keys normally come from the server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET), so the Backup page
  // is just "Sign in with Google", like a WordPress backup plugin. Keys typed on the page are the fallback.
  return {
    ...s, clientId: env.id() || s.clientId, clientSecret: env.secret() || openSecret(s.secretSealed ?? null),
    // GOOGLE_REFRESH_TOKEN on the server = connected for good, no sign-in on the page needed.
    refreshToken: env.refresh() || openToken(s.tokenSealed), keepDays: s.keepDays || 30, includeFiles: !!s.includeFiles,
  };
}

/** Where the Drive connection comes from, for the Backup page. */
export const driveFromServer = () => !!env.refresh();

/** True when the Google keys are set on the server, so nobody has to type them on the Backup page. */
export const googleKeysOnServer = () => !!(env.id() && env.secret());

export async function saveBackupConfig(patch: BackupConfig) {
  const cur = await backupConfig();
  const next = { ...cur, ...patch };
  const stored: Stored = {
    // Keys that come from the server are never copied into the database.
    clientId: next.clientId === env.id() ? undefined : next.clientId, email: next.email, folderId: next.folderId, includeFiles: next.includeFiles, keepDays: next.keepDays,
    secretSealed: next.clientSecret && next.clientSecret !== env.secret() ? sealSecret(next.clientSecret) : null, tokenSealed: next.refreshToken && next.refreshToken !== env.refresh() ? sealToken(next.refreshToken) : null,
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

/** Google's error, in plain words where we know the fix. */
function driveProblem(status: number, body: string) {
  let msg = body;
  try { msg = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? body; } catch {}
  const project = msg.match(/project[= ](\d+)/)?.[1];
  if (/has not been used in project|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(msg)) {
    return `The Google Drive API is switched off in your Google Cloud project. Turn it on at console.cloud.google.com → APIs & Services → Library → Google Drive API → Enable${project ? ` (project ${project})` : ""}, wait 2–3 minutes, then press Back up now.`;
  }
  if (/storageQuotaExceeded|quota/i.test(msg)) return "The Google Drive is full. Free up space in that Google account (or keep fewer days of backups), then try again.";
  if (status === 401) return "Google access has expired. Press Reconnect in Settings → Backup and sign in again.";
  if (status === 404 && /File not found/i.test(msg)) return "The “AMS backups” folder was deleted in Drive. Press Back up now again and AMS will create a new one.";
  return `Google Drive: ${status} ${msg.slice(0, 300)}`;
}

async function drive(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(driveProblem(res.status, await res.text()));
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

async function subFolder(token: string, parent: string, name: string) {
  const res = await drive(token, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parent] }),
  });
  return ((await res.json()) as { id: string }).id;
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

/** One backup file per app. Every table belongs to exactly one, so together they are the whole database. */
export const BACKUP_GROUPS = [
  { key: "crm", label: "CRM", models: ["LeadSource", "LeadStatus", "Pipeline", "Stage", "Lead", "Company", "Contact", "Deal", "Activity", "DealUnit", "PaymentPlan", "Installment", "SalesTarget", "PropertyMatch", "Automation", "SavedFilter", "MessageTemplate", "ApiConnection", "WebhookLog"] },
  { key: "inventory", label: "Inventory", models: ["Project", "ProjectImage", "Block", "Unit", "UnitImage"] },
  { key: "calls", label: "Calls", models: ["CallCampaign", "CallBatch", "CallTarget", "CallLog", "DncNumber", "SipAccount", "CallRecording"] },
  { key: "hr", label: "HR & payroll", models: ["Department", "Designation", "Employee", "EmployeeRelative", "EmployeeQualification", "EmployeeBank", "Policy", "PolicyAck", "LetterTemplate", "EmployeeLetter", "CustomField", "EngagementSurvey", "EngagementResponse", "HrPost", "EmployeeEvent", "EmployeeDocument", "ChecklistItem", "ApprovalFlow", "ApprovalRequest", "ApprovalAction", "Shift", "RosterDay", "CheckinDevice", "Holiday", "AttendancePunch", "PunchOriginal", "AttendanceLog", "AttendanceDay", "AttendanceBreak", "AttendanceMachine", "LeaveType", "LeaveBalance", "LeaveRequest", "SalaryProfile", "SalaryRevision", "LeaveEncashment", "PayComponent", "TaxSlab", "PayrollRun", "Payslip", "PayslipLine", "PayrollAdjustment", "PayItem", "CompanyBank", "FinalSettlement", "Loan", "LoanRepayment", "Expense", "JobOpening", "Candidate", "Interview", "AppraisalCycle", "ProbationReview", "Appraisal", "Asset", "AssetLog", "OnboardingInvite", "ShiftSwap", "PayrollCheck", "CheckIn", "FeedPost", "ExitInterview"] },
  { key: "finance", label: "Finance", models: ["FinAccount", "FinCategory", "FinEntry", "FinProof", "FinBudget", "FinRecurring", "FinTopup", "FinCashCount", "FinPayable", "FinBankLine"] },
  { key: "system", label: "Users, roles & settings", models: [] as string[] }, // everything else
] as const;
export type BackupGroup = (typeof BACKUP_GROUPS)[number]["key"];
const LISTED = new Set<string>(BACKUP_GROUPS.flatMap((g) => [...g.models]));
const inGroup = (model: string, g: BackupGroup) => (g === "system" ? !LISTED.has(model) : (BACKUP_GROUPS.find((x) => x.key === g)!.models as readonly string[]).includes(model));

/** Writes the tables (all, or one app's) to a gzipped JSON file, 2,000 rows at a time. */
export async function dumpDatabase(file: string, group?: BackupGroup) {
  const out = createGzip();
  const done = new Promise<void>((ok, fail) => { out.pipe(createWriteStream(file)).on("finish", ok).on("error", fail); });
  const write = (s: string) => new Promise<void>((ok) => { if (out.write(s)) ok(); else out.once("drain", ok); });
  await write(`{"version":1,"app":${JSON.stringify(group ?? "all")},"createdAt":${JSON.stringify(new Date().toISOString())},"models":{`);
  const models = Prisma.dmmf.datamodel.models.filter((m) => !group || inGroup(m.name, group));
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
    const token = await accessToken(c);
    const root = await ensureFolder(token, c);
    // One dated folder per backup with a file per app: crm, inventory, calls, hr, system (+ files.zip).
    const folderId = await subFolder(token, root, `AMS ${stamp}`);
    let size = 0;
    const names: string[] = [];
    for (const g of BACKUP_GROUPS) {
      const file = path.join(dir, `${g.key}.json.gz`);
      await dumpDatabase(file, g.key);
      size += (await upload(token, folderId, file, `${g.key}-${stamp}.json.gz`, "application/gzip")).size;
      names.push(g.key);
    }
    if (c.includeFiles) {
      const zipFile = path.join(dir, "files.zip");
      await zipUploads(zipFile);
      size += (await upload(token, folderId, zipFile, `files-${stamp}.zip`, "application/zip")).size;
      names.push("files");
    }
    const up = { id: folderId };
    const dbFile = `folder:${names.join(",")}`;
    await prune(token, root, c.keepDays ?? 30);
    await db.backupRun.update({ where: { id: run.id }, data: { status: "ok", fileName: dbFile, sizeBytes: size, driveFileId: up.id, finishedAt: new Date() } });
    await (await import("./heartbeat")).beat("backup");
    return { ok: true };
  } catch (e) {
    await db.backupRun.update({ where: { id: run.id }, data: { status: "failed", error: (e as Error).message.slice(0, 2000), finishedAt: new Date() } });
    await (await import("./heartbeat")).beat("backup", false, (e as Error).message);
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
