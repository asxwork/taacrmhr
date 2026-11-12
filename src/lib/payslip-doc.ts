// One payslip, laid out like the company's Excel payslip: payslip #, payment date, pay period, working days,
// Description / Hours / Rate / Amount / YTD / Type lines, gross → deductions → net, and the payment details.
// The printable page and the email both render from this, so they always match.
import { eachDayOfInterval, endOfMonth, format, getISODay, startOfMonth } from "date-fns";
import { db } from "@/lib/db";
import { monthDate } from "@/lib/payroll";
import { sendMail } from "@/lib/mail";
import { nextNumber } from "@/lib/sequence";

export type PayslipDoc = Awaited<ReturnType<typeof payslipDoc>>;
const TYPE: Record<string, string> = { component: "Wages", overtime: "Overtime", commission: "Commission", expense: "Reimbursement", adjustment: "Other", tax: "Tax", eobi: "EOBI", pf: "Provident fund", loan: "Loan", absence: "Absence", late: "Late", unpaid: "Unpaid leave" };

export const payslipNo = (n: number | null | undefined) => (n ? `PS-${String(n).padStart(6, "0")}` : "—");

async function setting(key: string, d: string) {
  return (await db.setting.findUnique({ where: { key } }))?.value ?? d;
}

/** Financial year start month (1–12): July by default (Pakistan tax year). */
export async function fyStartMonth() {
  const n = Number(await setting("payroll.fyStart", "7"));
  return n >= 1 && n <= 12 ? n : 7;
}

export async function payslipDoc(id: string) {
  const slip = await db.payslip.findUnique({
    where: { id },
    include: { run: true, employee: { include: { branch: true, shift: true, banks: { orderBy: { effectiveFrom: "desc" }, take: 1 } } }, lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!slip) return null;
  const month = monthDate(slip.run.month);
  const [company, fy, holidays] = await Promise.all([
    setting("company.name", "The Advisor Associates"),
    fyStartMonth(),
    db.holiday.findMany({ where: { date: { gte: startOfMonth(month), lte: endOfMonth(month) }, OR: [{ branchId: null }, { branchId: slip.employee.branchId }] }, select: { date: true } }),
  ]);

  // Working days: the shift's work days in the month, minus public holidays. Hours = working days × shift hours.
  const shift = slip.employee.shift ?? { start: "09:00", end: "18:00", workDays: "1,2,3,4,5,6" };
  const workDays = shift.workDays.split(",").map(Number);
  const off = new Set(holidays.map((h) => format(h.date, "yyyy-MM-dd")));
  const working = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }).filter((d) => workDays.includes(getISODay(d)) && !off.has(format(d, "yyyy-MM-dd"))).length;
  const [sh, sm] = shift.start.split(":").map(Number);
  const [eh, em] = shift.end.split(":").map(Number);
  let perDay = ((eh! * 60 + em!) - (sh! * 60 + sm!)) / 60;
  if (perDay <= 0) perDay += 24; // night shift
  const hours = Math.round(working * perDay);
  const rate = hours ? Math.round((slip.gross / hours) * 100) / 100 : 0;

  // YTD: the same line in this financial year's approved payslips up to this month.
  const fyYear = month.getMonth() + 1 >= fy ? month.getFullYear() : month.getFullYear() - 1;
  const fyFrom = `${fyYear}-${String(fy).padStart(2, "0")}`;
  const ytdLines = await db.payslipLine.findMany({
    where: { payslip: { employeeId: slip.employeeId, run: { month: { gte: fyFrom, lte: slip.run.month }, OR: [{ status: { not: "draft" } }, { id: slip.runId }] } } },
    select: { kind: true, label: true, amount: true },
  });
  const ytd = (kind: string, label: string) => ytdLines.filter((l) => l.kind === kind && l.label === label).reduce((s, l) => s + l.amount, 0);
  const ytdNet = (await db.payslip.findMany({ where: { employeeId: slip.employeeId, run: { month: { gte: fyFrom, lte: slip.run.month }, OR: [{ status: { not: "draft" } }, { id: slip.runId }] } }, select: { net: true } })).reduce((s, p) => s + p.net, 0);

  const earnings = slip.lines.filter((l) => l.kind === "earning").map((l, i) => ({
    label: l.label, hours: i === 0 && l.source === "component" ? hours : null, rate: i === 0 && l.source === "component" ? rate : null,
    amount: l.amount, ytd: ytd("earning", l.label), type: TYPE[l.source] ?? "Other",
  }));
  const deductions = slip.lines.filter((l) => l.kind === "deduction").map((l) => ({ label: l.label, amount: l.amount, ytd: ytd("deduction", l.label), type: TYPE[l.source] ?? "Deduction" }));
  const bank = slip.employee.banks[0];

  return {
    id: slip.id,
    number: payslipNo(slip.number),
    status: slip.run.status,
    month: format(month, "MMMM yyyy"),
    paymentDate: format(slip.run.paidAt ?? endOfMonth(month), "d MMM yyyy"),
    payPeriod: `${format(startOfMonth(month), "dd")} – ${format(endOfMonth(month), "dd MMM yyyy")}`,
    workingDays: working,
    daysPaid: `${slip.employedDays} of ${slip.daysInMonth}`,
    absent: slip.absentDays, late: slip.lateCount,
    employer: { name: company, address: slip.employee.branch?.address ?? "" },
    employee: { name: slip.employee.fullName, code: slip.employee.code, designation: slip.designation ?? "—", department: slip.department ?? "—", email: slip.employee.personalEmail ?? slip.employee.officialEmail ?? null, userId: slip.employee.userId },
    earnings, deductions,
    gross: slip.earnings, totalDeductions: slip.deductions, net: slip.net, ytdNet,
    payment: {
      method: bank || slip.accountNumber ? "Bank Transfer" : "Cash",
      bank: slip.bankName ?? bank?.bankName ?? "—",
      account: slip.accountNumber ?? bank?.accountNumber ?? "—",
      title: slip.accountTitle ?? bank?.accountTitle ?? slip.employee.fullName,
      branch: bank?.branchName ?? "—",
    },
  };
}

const n = (v: number) => Math.round(v).toLocaleString("en-PK");
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Email version: table layout with inline styles so it looks right in Gmail and Outlook. */
export function payslipEmailHtml(d: NonNullable<PayslipDoc>, link: string) {
  const td = "padding:8px 10px;border-bottom:1px solid #e6e9ef;font-size:13px";
  const th = "padding:8px 10px;background:#0f1a2a;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.04em;text-align:left";
  const row = (cells: (string | number | null)[], bold = false) => `<tr>${cells.map((c, i) => `<td style="${td};${i ? "text-align:right;" : ""}${bold ? "font-weight:700;" : ""}">${c ?? ""}</td>`).join("")}</tr>`;
  const kv = (k: string, v: string) => `<tr><td style="padding:3px 0;color:#6b7280;font-size:13px">${esc(k)}</td><td style="padding:3px 0;font-size:13px;font-weight:600;text-align:right">${esc(v)}</td></tr>`;
  return `<div style="background:#f4f6fa;padding:24px 0;font-family:Arial,Helvetica,sans-serif;color:#0f1a2a">
<table role="presentation" width="640" align="center" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e6e9ef">
<tr><td style="background:#0f1a2a;padding:20px 24px;color:#fff"><table width="100%"><tr>
<td><div style="font-size:12px;letter-spacing:.2em;color:#d4a94a">PAYSLIP</div><div style="font-size:20px;font-weight:700;margin-top:4px;color:#ffffff">${esc(d.month)}</div></td>
<td style="text-align:right;font-size:12px;line-height:1.6;color:#cbd5e1">Payslip # <b style="color:#fff">${esc(d.number)}</b><br>Payment date <b style="color:#fff">${esc(d.paymentDate)}</b><br>Pay period <b style="color:#fff">${esc(d.payPeriod)}</b><br>Working days <b style="color:#fff">${d.workingDays}</b></td></tr></table></td></tr>
<tr><td style="padding:20px 24px"><table width="100%"><tr>
<td width="48%" valign="top"><div style="font-size:11px;letter-spacing:.1em;color:#6b7280">EMPLOYER</div><div style="font-weight:700;margin-top:4px">${esc(d.employer.name)}</div><div style="font-size:12px;color:#6b7280">${esc(d.employer.address)}</div></td>
<td width="4%"></td>
<td width="48%" valign="top"><div style="font-size:11px;letter-spacing:.1em;color:#6b7280">EMPLOYEE</div><div style="font-weight:700;margin-top:4px">${esc(d.employee.name)}</div>
<table width="100%">${kv("Employee ID", d.employee.code)}${kv("Designation", d.employee.designation)}${kv("Department", d.employee.department)}</table></td></tr></table></td></tr>
<tr><td style="padding:0 24px"><table width="100%" cellpadding="0" cellspacing="0">
<tr><th style="${th}">Description</th><th style="${th};text-align:right">Hours</th><th style="${th};text-align:right">Rate</th><th style="${th};text-align:right">Amount</th><th style="${th};text-align:right">YTD</th></tr>
${d.earnings.map((e) => row([esc(e.label), e.hours, e.rate != null ? n(e.rate) : null, n(e.amount), n(e.ytd)])).join("")}
${row(["Gross pay", null, null, n(d.gross), null], true)}
${d.deductions.map((e) => row([`− ${esc(e.label)}`, null, null, n(e.amount), n(e.ytd)])).join("")}
${row(["Total deductions", null, null, n(d.totalDeductions), null], true)}
</table></td></tr>
<tr><td style="padding:16px 24px"><table width="100%" style="background:#0f1a2a;border-radius:10px;color:#fff"><tr><td style="padding:14px 18px;font-size:14px">NET PAY</td><td style="padding:14px 18px;text-align:right;font-size:22px;font-weight:700">PKR ${n(d.net)}</td></tr></table></td></tr>
<tr><td style="padding:0 24px 20px"><div style="font-size:11px;letter-spacing:.1em;color:#6b7280;margin-bottom:6px">PAYMENT DETAIL</div>
<table width="100%">${kv("Payment method", d.payment.method)}${kv("Bank name", d.payment.bank)}${kv("IBAN / Account number", d.payment.account)}${kv("Branch", d.payment.branch)}</table>
<p style="margin:18px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#d4a94a;color:#0f1a2a;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px">Open / download PDF</a></p></td></tr>
<tr><td style="padding:14px 24px;background:#f9fafb;font-size:11px;color:#6b7280;text-align:center">This is a computer-generated payslip and is confidential. · ${esc(d.employer.name)}</td></tr>
</table></div>`;
}

/** Gives every payslip of the run its permanent number (in employee-code order) if it has none yet. */
export async function numberPayslips(runId: string) {
  const slips = await db.payslip.findMany({ where: { runId, number: null }, select: { id: true, employee: { select: { code: true } } } });
  slips.sort((a, b) => a.employee.code.localeCompare(b.employee.code, undefined, { numeric: true }));
  if (!slips.length) return;
  // First run: start from the number in Payroll settings (e.g. 598 → PS-000598) so it continues the old register.
  const seq = await db.sequence.findUnique({ where: { name: "payslip" } });
  if (!seq) {
    const start = Number(await setting("payroll.payslipStart", "1")) || 1;
    await db.sequence.create({ data: { name: "payslip", value: start - 1 } }).catch(() => {});
  }
  for (const s of slips) await db.payslip.update({ where: { id: s.id }, data: { number: await nextNumber("payslip") } });
}

/** Emails each payslip of the run to its employee (personal email, else official, else their login email). */
export async function emailPayslips(runId: string, onlyIds?: string[]) {
  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const slips = await db.payslip.findMany({ where: { runId, ...(onlyIds && { id: { in: onlyIds } }) }, select: { id: true, employee: { select: { userId: true, user: { select: { email: true } } } } } });
  let sent = 0, skipped = 0, failed = 0;
  for (const s of slips) {
    const d = await payslipDoc(s.id);
    const to = d?.employee.email ?? s.employee.user?.email ?? null;
    if (!d || !to) { skipped++; continue; }
    const res = await sendMailHtml(to, `Payslip ${d.month} · ${d.number}`, payslipEmailHtml(d, `${appUrl}/payslips/${d.id}`), d.employee.userId);
    if (res.status === "sent") { sent++; await db.payslip.update({ where: { id: s.id }, data: { emailedAt: new Date() } }); }
    else if (res.status === "skipped") skipped++;
    else failed++;
  }
  return { sent, skipped, failed };
}

async function sendMailHtml(to: string, subject: string, html: string, userId: string | null) {
  return sendMail(to, subject, "", { userId, logBody: `${subject} (payslip email)`, html });
}
