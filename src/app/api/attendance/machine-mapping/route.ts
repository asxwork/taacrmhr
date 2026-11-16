import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/payroll-reports";

/** Sample / current mapping CSV for one machine: fill employee_code next to each machine user and upload it back. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.attendance")) return new Response("Forbidden", { status: 403 });
  const id = new URL(req.url).searchParams.get("machine") ?? "";
  const m = await db.attendanceMachine.findUnique({ where: { id } });
  if (!m) return new Response("Not found", { status: 404 });
  const users = await db.machineUser.findMany({ where: { machineId: id }, orderBy: { deviceUserId: "asc" } });
  const emps = new Map((await db.employee.findMany({ where: { id: { in: users.map((u) => u.employeeId).filter((x): x is string => !!x) } }, select: { id: true, code: true, fullName: true } })).map((e) => [e.id, e]));
  const rows = users.map((u) => { const e = u.employeeId ? emps.get(u.employeeId) : null; return [e?.code ?? "", u.deviceUserId, u.name ?? "", e?.fullName ?? ""]; });
  if (!rows.length) rows.push(["TAA-0001", "1", "Name on machine", "Employee name"]);
  const name = (m.name ?? "machine").replace(/[^\w-]+/g, "-");
  return new Response("﻿" + toCsv(["employee_code", "machine_user_id", "machine_name", "employee_name"], rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="mapping-${name}.csv"` } });
}
