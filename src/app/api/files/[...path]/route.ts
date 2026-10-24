import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { resolveUpload } from "@/lib/files";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const rel = (await params).path.join("/");
  const abs = resolveUpload(rel);
  const type = TYPES[rel.split(".").pop() ?? ""];
  if (!abs || !type) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(abs);
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
