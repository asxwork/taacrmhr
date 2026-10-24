"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { cancelRequest, submitRequest } from "@/lib/approvals";
import { saveUpload } from "@/lib/files";
import { str, type FormState } from "@/lib/utils";
import { EXPENSE_CATEGORIES } from "@/lib/hr-shared";

async function me() {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id } });
  return { user, emp };
}

export async function submitExpense(_: FormState, fd: FormData): Promise<FormState> {
  const { user, emp } = await me();
  if (!emp) return { error: "Your login isn't linked to an employee record." };
  const amount = parseFloat(str(fd, "amount").replace(/,/g, ""));
  const date = new Date(str(fd, "date"));
  const category = EXPENSE_CATEGORIES.includes(str(fd, "category")) ? str(fd, "category") : "Other";
  if (!Number.isFinite(amount) || amount <= 0 || amount > 5_000_000) return { error: "Enter the amount spent." };
  if (Number.isNaN(date.getTime()) || date > new Date()) return { error: "Choose the date you spent it (not in the future)." };

  let receipt: string | null = null;
  const file = fd.get("receipt");
  if (file instanceof File && file.size > 0) {
    const res = await saveUpload(file, `expenses/${emp.id}`, { maxBytes: 8_000_000, allowPdf: true });
    if ("error" in res) return { error: res.error };
    receipt = res.path;
  }
  const exp = await db.expense.create({ data: { employeeId: emp.id, date, category, amount, description: str(fd, "description") || null, receipt } });
  const approval = await submitRequest({
    type: "expense", employeeId: emp.id, requesterId: user.id,
    title: `Expense — ${emp.fullName}: ${category} PKR ${amount.toLocaleString("en-PK")}`,
    summary: `${format(date, "d MMM")}${exp.description ? ` · ${exp.description}` : ""}`, payload: { expenseId: exp.id },
  });
  await db.expense.update({ where: { id: exp.id }, data: { approvalId: approval.id } });
  revalidatePath("/me/expenses");
  return { ok: true, message: "Claim submitted for approval." };
}

export async function requestLoan(_: FormState, fd: FormData): Promise<FormState> {
  const { user, emp } = await me();
  if (!emp) return { error: "Your login isn't linked to an employee record." };
  const kind = str(fd, "kind") === "advance" ? "advance" : "loan";
  const amount = parseFloat(str(fd, "amount").replace(/,/g, ""));
  const installment = parseFloat(str(fd, "installment").replace(/,/g, "")) || amount;
  const startMonth = str(fd, "startMonth");
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount." };
  if (installment <= 0 || installment > amount) return { error: "Monthly deduction must be between 1 and the full amount." };
  if (!/^\d{4}-\d{2}$/.test(startMonth) || startMonth < format(new Date(), "yyyy-MM")) return { error: "Choose the first deduction month (this month or later)." };
  if (await db.loan.findFirst({ where: { employeeId: emp.id, status: { in: ["pending", "active"] }, kind } })) return { error: `You already have an open ${kind}.` };

  const loan = await db.loan.create({ data: { employeeId: emp.id, kind, amount, installment, startMonth, reason: str(fd, "reason") || null } });
  const approval = await submitRequest({
    type: "loan", employeeId: emp.id, requesterId: user.id,
    title: `${kind === "advance" ? "Salary advance" : "Loan"} — ${emp.fullName}: PKR ${amount.toLocaleString("en-PK")}`,
    summary: `${Math.ceil(amount / installment)} × PKR ${installment.toLocaleString("en-PK")} from ${startMonth}${loan.reason ? ` · ${loan.reason}` : ""}`, payload: { loanId: loan.id },
  });
  await db.loan.update({ where: { id: loan.id }, data: { approvalId: approval.id } });
  revalidatePath("/me/expenses");
  return { ok: true, message: "Request sent for approval." };
}

export async function withdrawMine(fd: FormData) {
  const { user } = await me();
  const approvalId = str(fd, "approvalId");
  if (approvalId) await cancelRequest(user, approvalId);
  revalidatePath("/me/expenses");
}
