import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** My payslips as a CSV (one row per month), optionally for one year. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const year = new URL(req.url).searchParams.get("year");
  const slips = await db.payslip.findMany({
    where: { employee: { userId: user.id }, run: { status: { in: ["approved", "paid"] }, ...(year && /^\d{4}$/.test(year) ? { month: { startsWith: year } } : {}) } },
    include: { run: { select: { month: true, status: true } } }, orderBy: { run: { month: "asc" } },
  });
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Month", "Payslip #", "Gross", "Deductions", "Income tax", "Net pay", "Status"], ...slips.map((p) => [p.run.month, p.number ? `PS-${String(p.number).padStart(6, "0")}` : "", p.earnings, p.deductions, p.tax, p.net, p.run.status])];
  return new Response("﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="my-payslips${year ? `-${year}` : ""}.csv"`, "Cache-Control": "private, no-store" } });
}
