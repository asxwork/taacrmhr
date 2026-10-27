"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { addEvent } from "@/lib/hr";
import { computeSettlement } from "@/lib/payroll-extra";
import { str, type FormState } from "@/lib/utils";

async function admin() {
  const user = await requireUser();
  return user.isSuperAdmin || scopeFor(user, "hr.payroll", "edit") === "all" ? user : null;
}
const MONTH = /^\d{4}-\d{2}$/;

/** Pay items can't change once that month's payroll is approved. */
async function locked(month: string) {
  const run = await db.payrollRun.findUnique({ where: { month } });
  return run && run.status !== "draft" ? `Payroll for ${month} is already approved. Reopen it first.` : null;
}

/** Reward or manual commission for an employee, paid by that month's payroll. */
export async function savePayItem(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Only payroll admins can add pay items." };
  const kind = ["reward", "commission"].includes(str(fd, "kind")) ? str(fd, "kind") : "reward";
  const month = str(fd, "month");
  const amount = parseFloat(str(fd, "amount").replace(/,/g, ""));
  const label = str(fd, "label").slice(0, 120);
  if (!MONTH.test(month)) return { error: "Choose the payroll month." };
  if (!(amount > 0)) return { error: "Enter the amount." };
  if (!label) return { error: kind === "reward" ? "What is the reward for?" : "Describe the commission." };
  const lock = await locked(month);
  if (lock) return { error: lock };
  const emp = await db.employee.findUnique({ where: { id: str(fd, "employeeId") } });
  if (!emp) return { error: "Choose the employee." };
  await db.payItem.create({ data: { employeeId: emp.id, month, kind, label: kind === "reward" ? `Reward: ${label}` : `Commission: ${label}`, amount, taxable: fd.get("taxable") === "on", note: str(fd, "note") || null, createdById: user.id } });
  if (kind === "reward") await addEvent(emp.id, "note", `Reward: ${label} (PKR ${Math.round(amount).toLocaleString("en-PK")})`, { byId: user.id });
  await audit(user.id, "create", "payItem", emp.id, `${kind} ${amount} for ${emp.fullName} (${month})`);
  revalidatePath(`/hr/payroll/${kind === "reward" ? "rewards" : "items/commission"}`);
  return { ok: true, message: `Added to ${month} payroll.` };
}

export async function deletePayItem(fd: FormData) {
  const user = await admin();
  if (!user) return;
  const it = await db.payItem.findUnique({ where: { id: str(fd, "id") } });
  if (!it || (await locked(it.month))) return;
  await db.payItem.delete({ where: { id: it.id } });
  revalidatePath("/hr/payroll/rewards");
  revalidatePath("/hr/payroll/items/commission");
  revalidatePath("/hr/payroll/items/late-sittings");
}

/** Saves the late-sitting count per employee for a month (count × rate becomes one pay item each). */
export async function saveLateSittings(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Only payroll admins can change late sittings." };
  const month = str(fd, "month");
  if (!MONTH.test(month)) return { error: "Choose the month." };
  const lock = await locked(month);
  if (lock) return { error: lock };
  const rate = parseFloat(str(fd, "rate"));
  if (!(rate >= 0)) return { error: "Enter the rate per sitting." };
  await db.setting.upsert({ where: { key: "payroll.lateSittingRate" }, update: { value: String(rate) }, create: { key: "payroll.lateSittingRate", value: String(rate) } });
  let saved = 0;
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("n:")) continue;
    const employeeId = k.slice(2);
    const n = Math.max(0, Math.round(Number(v) || 0));
    const existing = await db.payItem.findFirst({ where: { employeeId, month, kind: "late_sitting" } });
    if (!n || !rate) {
      if (existing) await db.payItem.delete({ where: { id: existing.id } });
      continue;
    }
    const data = { quantity: n, rate, amount: n * rate, label: `Late sittings (${n} × PKR ${rate.toLocaleString("en-PK")})` };
    if (existing) await db.payItem.update({ where: { id: existing.id }, data });
    else await db.payItem.create({ data: { ...data, employeeId, month, kind: "late_sitting", createdById: user.id } });
    saved++;
  }
  await audit(user.id, "update", "payItem", month, `Late sittings for ${month}: ${saved} employee(s)`);
  revalidatePath("/hr/payroll/items/late-sittings");
  return { ok: true, message: `Saved for ${saved} employee${saved === 1 ? "" : "s"}. Recalculate the ${month} payroll to include them.` };
}

export async function saveCompanyBank(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Only payroll admins can manage banks." };
  const name = str(fd, "name");
  const accountTitle = str(fd, "accountTitle");
  const accountNumber = str(fd, "accountNumber");
  if (!name || !accountTitle || !accountNumber) return { error: "Bank, account title and number are required." };
  const isDefault = fd.get("isDefault") === "on" || !(await db.companyBank.count({ where: { active: true } }));
  if (isDefault) await db.companyBank.updateMany({ data: { isDefault: false } });
  await db.companyBank.create({ data: { name, accountTitle, accountNumber, branch: str(fd, "branch") || null, isDefault } });
  revalidatePath("/hr/payroll/banks");
  return { ok: true, message: "Bank account added." };
}

export async function updateCompanyBank(fd: FormData) {
  const user = await admin();
  if (!user) return;
  const id = str(fd, "id");
  const op = str(fd, "op");
  if (op === "default") {
    await db.companyBank.updateMany({ data: { isDefault: false } });
    await db.companyBank.update({ where: { id }, data: { isDefault: true, active: true } });
  } else if (op === "toggle") {
    const b = await db.companyBank.findUnique({ where: { id } });
    if (b) await db.companyBank.update({ where: { id }, data: { active: !b.active, isDefault: b.active ? false : b.isDefault } });
  }
  revalidatePath("/hr/payroll/banks");
}

/** Approves the settlement as computed now: closes loans, marks claims and encashments paid, keeps a snapshot. */
export async function approveSettlement(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Only payroll admins can approve settlements." };
  const employeeId = str(fd, "employeeId");
  if (await db.finalSettlement.findFirst({ where: { employeeId } })) return { error: "A settlement is already saved for this employee." };
  const s = await computeSettlement(employeeId);
  if (!["notice", "left"].includes(s.emp.status)) return { error: "Settlements are for employees serving notice or who have left." };
  await db.finalSettlement.create({ data: { employeeId, lastWorkingDay: s.lastWorkingDay, lines: JSON.stringify(s.lines), net: s.net, note: str(fd, "note") || null, createdById: user.id } });
  if (s.expenseIds.length) await db.expense.updateMany({ where: { id: { in: s.expenseIds } }, data: { status: "paid" } });
  if (s.encashmentIds.length) await db.leaveEncashment.updateMany({ where: { id: { in: s.encashmentIds } }, data: { status: "paid" } });
  for (const l of s.loans) {
    const left = l.amount - l.repayments.reduce((t, r) => t + r.amount, 0);
    if (left > 0.5) await db.loanRepayment.create({ data: { loanId: l.id, amount: left, note: "Recovered in final settlement" } });
    await db.loan.update({ where: { id: l.id }, data: { status: "closed" } });
  }
  await addEvent(employeeId, "note", `Final settlement approved: PKR ${Math.round(s.net).toLocaleString("en-PK")}`, { byId: user.id });
  await audit(user.id, "create", "finalSettlement", employeeId, `Final settlement ${s.net} for ${s.emp.fullName}`);
  revalidatePath("/hr/payroll/settlements");
  return { ok: true, message: "Settlement approved." };
}

export async function markSettlementPaid(fd: FormData) {
  const user = await admin();
  if (!user) return;
  await db.finalSettlement.updateMany({ where: { id: str(fd, "id"), status: "approved" }, data: { status: "paid", paidAt: new Date() } });
  revalidatePath("/hr/payroll/settlements");
}
