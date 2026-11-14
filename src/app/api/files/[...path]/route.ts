import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { resolveUpload } from "@/lib/files";
import { db } from "@/lib/db";
import { employeeAllows } from "@/lib/hr";
import { can, scopeMatcher } from "@/lib/permissions";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const parts = (await params).path;
  if (parts.some((p) => p === ".." || p === "." || p.includes("\\"))) return new Response("Not found", { status: 404 });
  const rel = parts.join("/");
  // Call recordings are only served by /api/calls/recordings (Super Admin, audited).
  if (rel.startsWith("calls/")) return new Response("Not found", { status: 404 });
  // HR documents (CNIC scans, contracts…) are private: only the employee and people who can see their record.
  if (rel.startsWith("hr/")) {
    const doc = await db.employeeDocument.findUnique({ where: { path: rel }, include: { employee: { select: { userId: true, branchId: true } } } });
    if (!doc || !(doc.employee.userId === user.id || (await employeeAllows(user, doc.employee, "view")))) return new Response("Not found", { status: 404 });
  }
  // Expense receipts: the claimant and people who can see their expenses.
  if (rel.startsWith("expenses/")) {
    const exp = await db.expense.findFirst({ where: { receipt: rel }, include: { employee: { select: { userId: true, branchId: true } } } });
    if (!exp || !(exp.employee.userId === user.id || (can(user, "hr.expenses") && (await scopeMatcher(user, "hr.expenses", "view"))({ ownerId: exp.employee.userId, branchId: exp.employee.branchId })))) return new Response("Not found", { status: 404 });
  }
  // Finance bills and receipts: Finance users only (Sir personal ones: Sir personal access).
  if (rel.startsWith("finance/")) {
    const proof = await db.finProof.findFirst({ where: { path: rel }, select: { entry: { select: { personal: true } } } });
    const personal = proof?.entry.personal ?? !!(await db.finEntry.findFirst({ where: { receipt: rel, personal: true }, select: { id: true } }));
    if (!can(user, personal ? "finance.personal" : "finance") && !can(user, "finance.boss")) return new Response("Not found", { status: 404 });
  }
  // Check-in selfies: the person themselves and attendance managers.
  if (rel.startsWith("attendance/")) {
    const punch = await db.attendancePunch.findFirst({ where: { photo: rel }, select: { employee: { select: { userId: true, branchId: true } } } });
    if (!punch || !(punch.employee.userId === user.id || can(user, "hr.attendance"))) return new Response("Not found", { status: 404 });
  }
  // CVs: recruitment team only.
  if (rel.startsWith("cvs/") && !can(user, "hr.recruitment") && !(await db.employeeDocument.findUnique({ where: { path: rel } }))) return new Response("Not found", { status: 404 });
  const abs = resolveUpload(rel);
  const type = TYPES[rel.split(".").pop() ?? ""];
  if (!abs || !type) return new Response("Not found", { status: 404 });
  // ?w=64…1200: a smaller copy of a photo (made once with sharp, kept next to the uploads), much lighter on phones.
  const w = Number(new URL(req.url).searchParams.get("w"));
  if (w && type.startsWith("image/")) {
    const width = [64, 160, 400, 800, 1200].find((x) => x >= w) ?? 1200;
    try {
      const thumb = path.join(path.dirname(abs), ".thumbs", `${path.basename(abs)}.${width}.webp`);
      let data = await readFile(thumb).catch(() => null);
      if (!data) {
        const sharp = (await import("sharp")).default;
        data = await sharp(await readFile(abs)).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
        await mkdir(path.dirname(thumb), { recursive: true }).catch(() => {});
        await writeFile(thumb, data).catch(() => {});
      }
      return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/webp", "Cache-Control": /^(hr|expenses|cvs|attendance)\//.test(rel) ? "private, no-store" : "private, max-age=604800", "X-Content-Type-Options": "nosniff" } });
    } catch { /* fall back to the original */ }
  }
  try {
    const data = await readFile(abs);
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": type, "Cache-Control": /^(hr|expenses|cvs)\//.test(rel) ? "private, no-store" : "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
