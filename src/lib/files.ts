import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { accessSync, constants, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

/** Where uploads used to be kept: inside the app folder, which the host rebuilds on every deploy. */
export const OLD_UPLOAD_ROOT = path.join(process.cwd(), "uploads");

/**
 * Uploads (photos, bills, documents…) live outside /public and are served by /api/files (signed-in users only).
 * On the live server they're kept OUTSIDE the app folder (~/ams-uploads), because every deploy rebuilds the app
 * folder and files saved inside it were lost. UPLOAD_DIR overrides; locally it stays ./uploads.
 */
function uploadRoot() {
  if (process.env.UPLOAD_DIR) return path.resolve(process.env.UPLOAD_DIR);
  if (!(process.env.DATABASE_URL ?? "").startsWith("mysql://")) return OLD_UPLOAD_ROOT;
  const inApp = (d: string) => d === process.cwd() || d.startsWith(process.cwd() + path.sep);
  const candidates = [homedir() && path.join(homedir(), "ams-uploads"), path.resolve(process.cwd(), "..", "ams-uploads")].filter((d): d is string => !!d && !inApp(d));
  for (const dir of candidates) {
    try { mkdirSync(dir, { recursive: true }); accessSync(dir, constants.W_OK); return dir; } catch { /* not writable here: try the next */ }
  }
  return OLD_UPLOAD_ROOT;
}
export const UPLOAD_ROOT = uploadRoot();

const IMAGE_SIGNATURES: [string, number[]][] = [
  ["jpg", [0xff, 0xd8, 0xff]],
  ["png", [0x89, 0x50, 0x4e, 0x47]],
  ["webp", [0x52, 0x49, 0x46, 0x46]], // RIFF…WEBP, checked below
  ["pdf", [0x25, 0x50, 0x44, 0x46]], // %PDF
];

/** Images only (JPG/PNG/WebP). */
export function saveImage(file: File, dir: string, maxBytes = 5_000_000) {
  return saveUpload(file, dir, { maxBytes, allowPdf: false });
}

/** Validates by content (not just extension) and saves under `dir`. Returns the relative path or an error. */
export async function saveUpload(file: File, dir: string, opts: { maxBytes?: number; allowPdf?: boolean } = {}): Promise<{ path: string; size: number } | { error: string }> {
  const maxBytes = opts.maxBytes ?? 5_000_000;
  if (file.size === 0) return { error: "Empty file." };
  if (file.size > maxBytes) return { error: `${file.name} is larger than ${Math.round(maxBytes / 1e6)} MB.` };
  const buf = Buffer.from(await file.arrayBuffer());
  let ext = IMAGE_SIGNATURES.find(([, sig]) => sig.every((b, i) => buf[i] === b))?.[0];
  // Many invoice systems put a few bytes (BOM, blank lines, a header) before "%PDF-"; the PDF format allows it in the first 1 KB.
  if (!ext && buf.subarray(0, 1024).includes("%PDF-")) ext = "pdf";
  if (!ext || (ext === "webp" && buf.subarray(8, 12).toString() !== "WEBP") || (ext === "pdf" && !opts.allowPdf)) {
    return { error: `${file.name} is not a ${opts.allowPdf ? "PDF, JPG, PNG or WebP file" : "JPG, PNG or WebP image"}.` };
  }

  const rel = path.posix.join(dir, `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`);
  const abs = path.join(UPLOAD_ROOT, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buf);
  return { path: rel, size: buf.length };
}

export async function deleteUpload(rel: string) {
  const abs = resolveUpload(rel);
  if (abs) await unlink(abs).catch(() => {});
}

/** Maps a relative upload path to disk, refusing anything that escapes UPLOAD_ROOT. */
export function resolveUpload(rel: string) {
  const abs = path.resolve(UPLOAD_ROOT, rel);
  return abs.startsWith(UPLOAD_ROOT + path.sep) ? abs : null;
}

/** Link to an upload; `w` asks for a smaller copy of a photo (64, 160, 400, 800 or 1200 px wide). */
export const fileUrl = (rel: string, w?: number) => `/api/files/${rel}${w ? `?w=${w}` : ""}`;

/** A drawn signature (canvas PNG data URL) saved as a file. Only real PNGs up to 500 KB. */
export async function saveSignature(dataUrl: string, dir: string): Promise<string | null> {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) return null;
  const buf = Buffer.from(m[1]!, "base64");
  if (buf.length < 100 || buf.length > 500_000 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  const rel = path.posix.join(dir, `${Date.now()}-${randomBytes(6).toString("hex")}.png`);
  const abs = path.join(UPLOAD_ROOT, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buf);
  return rel;
}

/** An uploaded image as a data: URL, for pages without a login (e.g. the client's invoice link). */
export async function uploadAsDataUrl(rel: string | null | undefined) {
  if (!rel || rel.includes("..")) return null;
  try {
    const buf = await readFile(path.join(UPLOAD_ROOT, rel));
    const ext = rel.split(".").pop()!.toLowerCase();
    return `data:${ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg"};base64,${buf.toString("base64")}`;
  } catch { return null; }
}
