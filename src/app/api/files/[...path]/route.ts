import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { resolveUpload } from "@/lib/files";
import { db } from "@/lib/db";
import { employeeAllows } from "@/lib/hr";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const parts = (await params).path;
  if (parts.some((p) => p === ".." || p === "." || p.includes("\\"))) return new Response("Not found", { status: 404 });
  const rel = parts.join("/");
  // HR documents (CNIC scans, contracts…) are private: only the employee and people who can see their record.
  if (rel.startsWith("hr/")) {
    const doc = await db.employeeDocument.findUnique({ where: { path: rel }, include: { employee: { select: { userId: true, branchId: true } } } });
    if (!doc || !(doc.employee.userId === user.id || (await employeeAllows(user, doc.employee, "view")))) return new Response("Not found", { status: 404 });
  }
  const abs = resolveUpload(rel);
  const type = TYPES[rel.split(".").pop() ?? ""];
  if (!abs || !type) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(abs);
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": type, "Cache-Control": rel.startsWith("hr/") ? "private, no-store" : "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
