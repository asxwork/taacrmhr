import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";

/** Uploads live outside /public and are served by /api/files (signed-in users only). */
export const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"));

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
  const ext = IMAGE_SIGNATURES.find(([, sig]) => sig.every((b, i) => buf[i] === b))?.[0];
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

export const fileUrl = (rel: string) => `/api/files/${rel}`;
