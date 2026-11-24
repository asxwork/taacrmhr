// The exact files (and pasted text) imported into a calling campaign, kept on the server so a Super Admin can
// download them again. Private folder: never served by /api/files, only by /api/calls/files (Super Admin).
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_ROOT } from "./files";

export const CALL_FILES_DIR = path.join(UPLOAD_ROOT, "call-imports");
const safe = (s: string) => s.replace(/[^A-Za-z0-9._ -]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "file";
const okId = (id: string) => /^[a-z0-9]{10,40}$/i.test(id);

export async function keepImportFile(campaignId: string, name: string, data: ArrayBuffer | Buffer | string) {
  if (!okId(campaignId)) return;
  const dir = path.join(CALL_FILES_DIR, campaignId);
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const body = typeof data === "string" ? data : Buffer.from(data instanceof Buffer ? data : new Uint8Array(data));
  await writeFile(path.join(dir, `${stamp} ${safe(name)}`), body).catch(() => {});
}

export async function listImportFiles(campaignId: string) {
  if (!okId(campaignId)) return [];
  const dir = path.join(CALL_FILES_DIR, campaignId);
  const names = await readdir(dir).catch(() => [] as string[]);
  const rows = await Promise.all(names.map(async (name) => ({ name, size: (await stat(path.join(dir, name)).catch(() => null))?.size ?? 0 })));
  return rows.sort((a, b) => b.name.localeCompare(a.name));
}

export function importFilePath(campaignId: string, name: string) {
  if (!okId(campaignId) || name.includes("/") || name.includes("\\") || name.startsWith(".")) return null;
  return path.join(CALL_FILES_DIR, campaignId, name);
}
