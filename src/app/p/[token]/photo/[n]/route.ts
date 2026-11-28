import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";
import { resolveUpload } from "@/lib/files";
import { disabledFeatures } from "@/lib/features";

/** Photo n of a shared listing (public: the long random link is the key). Resized to at most 1200 px. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string; n: string }> }) {
  const { token, n } = await params;
  if (token.length < 20 || (await disabledFeatures()).has("inv-share")) return new Response("Not found", { status: 404 });
  const unit = await db.unit.findFirst({ where: { publicToken: token }, select: { images: { orderBy: { sortOrder: "asc" }, select: { path: true } } } });
  const img = unit?.images[Number(n) || 0];
  const abs = img && resolveUpload(img.path);
  if (!abs) return new Response("Not found", { status: 404 });
  try {
    const sharp = (await import("sharp")).default;
    const data = await sharp(await readFile(abs)).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
