// Softphone on the company PBX (Issabel / Asterisk). Agents' browsers register as their own extensions over
// WebRTC (WSS), so AMS never needs admin access to the PBX itself. Recordings are made in the browser (both
// sides mixed) and kept in a Super Admin-only vault.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { unlink } from "node:fs/promises";
import { subDays } from "date-fns";
import { db } from "./db";
import { resolveUpload } from "./files";

export type PbxConfig = {
  make: string; model: string; host: string; wss: string; trunk: string; extensions: string; notes: string;
  /** SIP domain the extensions belong to (defaults to the host). */
  domain: string;
  /** STUN/TURN servers, one per line. */
  ice: string;
  /** Prefix dialled before a number for outside lines (e.g. 9), if the PBX needs one. */
  dialPrefix: string;
  /** Feature codes: voicemail, and supervisor listen / whisper / barge (dialled + extension). */
  voicemail: string; spyListen: string; spyWhisper: string; spyBarge: string;
  record: string; retentionDays: string;
};
export const PBX_KEYS = ["make", "model", "host", "wss", "trunk", "extensions", "notes", "domain", "ice", "dialPrefix", "voicemail", "spyListen", "spyWhisper", "spyBarge", "record", "retentionDays"] as const;

export async function pbxConfig(): Promise<PbxConfig> {
  const row = await db.setting.findUnique({ where: { key: "calls.pbx" } });
  let v: Partial<PbxConfig> = {};
  try { v = row ? JSON.parse(row.value) : {}; } catch {}
  const d: PbxConfig = { make: "Issabel", model: "", host: "", wss: "", trunk: "", extensions: "", notes: "", domain: "", ice: "stun:stun.l.google.com:19302", dialPrefix: "", voicemail: "*97", spyListen: "", spyWhisper: "", spyBarge: "", record: "on", retentionDays: "180" };
  return { ...d, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== null)) } as PbxConfig;
}

export const retentionDays = (c: PbxConfig) => Math.max(7, Math.min(3650, Number(c.retentionDays) || 180));

// SIP passwords are encrypted at rest with SIP_SECRET_KEY (falls back to CRON_SECRET), AES-256-GCM.
function key() {
  const k = process.env.SIP_SECRET_KEY || (process.env.CRON_SECRET !== "change-me" ? process.env.CRON_SECRET : "");
  return k ? createHash("sha256").update(`sip:${k}`).digest() : null;
}
export const canStoreSecrets = () => !!key();

export function sealSecret(plain: string) {
  const k = key();
  if (!k) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function openSecret(sealed: string | null) {
  const k = key();
  if (!k || !sealed) return null;
  try {
    const [iv, tag, enc] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv("aes-256-gcm", k, iv!);
    d.setAuthTag(tag!);
    return Buffer.concat([d.update(enc!), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** What the signed-in agent's browser needs to register, or why it can't. */
export async function sipConfigFor(userId: string) {
  const [cfg, acc] = await Promise.all([pbxConfig(), db.sipAccount.findUnique({ where: { userId } })]);
  if (!acc || !acc.enabled) return null;
  const password = openSecret(acc.secretEnc);
  if (!cfg.wss || !password) return null;
  const domain = cfg.domain || cfg.host || new URL(cfg.wss).hostname;
  return {
    wss: cfg.wss, domain, extension: acc.extension, password,
    ice: cfg.ice.split(/\s+/).filter((u) => /^(stun|turn)s?:/.test(u)).map((urls) => ({ urls })),
    dialPrefix: cfg.dialPrefix, voicemail: cfg.voicemail, record: cfg.record !== "off",
    spy: { listen: cfg.spyListen, whisper: cfg.spyWhisper, barge: cfg.spyBarge },
  };
}
export type SipConfig = NonNullable<Awaited<ReturnType<typeof sipConfigFor>>>;

/** Links a recording and the call log that share a SIP Call-ID (whichever arrives second does the linking). */
export async function linkRecording(pbxCallId: string, agentId: string) {
  const [rec, log] = await Promise.all([
    db.callRecording.findFirst({ where: { pbxCallId, agentId }, orderBy: { createdAt: "desc" } }),
    db.callLog.findFirst({ where: { pbxCallId, agentId }, orderBy: { startedAt: "desc" } }),
  ]);
  if (!rec || !log) return;
  await db.callRecording.update({ where: { id: rec.id }, data: { logId: log.id } });
  await db.callLog.update({ where: { id: log.id }, data: { recordingId: rec.id, recordingPath: rec.path, durationSec: log.durationSec ?? rec.durationSec } });
}

/** Daily: deletes recording files older than the retention period (the row stays as a record that it existed). */
export async function purgeOldRecordings() {
  const cutoff = subDays(new Date(), retentionDays(await pbxConfig()));
  const old = await db.callRecording.findMany({ where: { startedAt: { lt: cutoff }, deletedAt: null }, select: { id: true, path: true } });
  for (const r of old) {
    const abs = r.path ? resolveUpload(r.path) : null;
    if (abs) await unlink(abs).catch(() => {});
  }
  if (old.length) {
    await db.callRecording.updateMany({ where: { id: { in: old.map((r) => r.id) } }, data: { deletedAt: new Date(), path: null } });
    await db.callLog.updateMany({ where: { recordingId: { in: old.map((r) => r.id) } }, data: { recordingPath: null } });
  }
  return old.length;
}
