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
  // The company payslip has three fixed lines: Base Hourly (salary), Allowances / Bonus, Overtime.
  const sum = (pred: (src: string) => boolean, rows: { amount: number; ytd: number; src: string }[]) => ({ amount: rows.filter((r) => pred(r.src)).reduce((t, r) => t + r.amount, 0), ytd: rows.filter((r) => pred(r.src)).reduce((t, r) => t + r.ytd, 0) });
  const earnRows = slip.lines.filter((l) => l.kind === "earning").map((l) => ({ amount: l.amount, ytd: ytd("earning", l.label), src: l.source ?? "" }));
  const base = sum((x) => x === "component", earnRows), ot = sum((x) => x === "overtime", earnRows), other = sum((x) => x !== "component" && x !== "overtime", earnRows);
  const lines = [
    { label: "Base Hourly", hours, rate: hours ? Math.round((base.amount / hours) * 100) / 100 : 0, amount: base.amount, ytd: base.ytd, type: "Wages" },
    { label: "Allowances / Bonus", hours: null, rate: null, amount: other.amount, ytd: other.ytd, type: "Other" },
    { label: "Overtime", hours: null, rate: null, amount: ot.amount, ytd: ot.ytd, type: "Employer" },
  ];

  return {
    id: slip.id,
    number: payslipNo(slip.number),
    status: slip.run.status,
    month: format(month, "MMMM yyyy"),
    paymentDate: format(slip.run.paidAt ?? endOfMonth(month), "dd MMM, EEE yyyy"),
    lines,
    joiningDate: format(slip.employee.joiningDate, "MMM d, yyyy"),
    payPeriod: `${format(startOfMonth(month), "dd")} – ${format(endOfMonth(month), "dd MMM yyyy")}`,
    workingDays: working,
    daysPaid: `${slip.employedDays} of ${slip.daysInMonth}`,
    absent: slip.absentDays, late: slip.lateCount,
    employer: { name: company, address: (await setting("company.address", "")) || slip.employee.branch?.address || "" },
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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Email version of the same company layout, with inline styles so it looks right in Gmail and Outlook. */
export function payslipEmailHtml(d: NonNullable<PayslipDoc>, link: string) {
  const N = "#0B1F3A", G = "#B8913A", M = "#6B7280", F = "font-family:Arial,Helvetica,sans-serif";
  const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lab = (t: string) => `<div style="font-size:11px;font-weight:700;letter-spacing:.04em;color:${G};text-transform:uppercase">${esc(t)}</div>`;
  const kv = (k: string, v: string, w = "120px") => `<tr><td style="padding:2px 0;color:${M};font-size:13px;width:${w}">${esc(k)}</td><td style="padding:2px 0;font-size:13px;font-weight:700;color:${N}">${esc(v)}</td></tr>`;
  const head = (t: string, right = true) => `<th style="padding:9px 10px;background:${N};color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;text-align:${right ? "right" : "left"}">${t}</th>`;
  const cell = (v: string, right = true, color = N) => `<td style="padding:9px 10px;border-bottom:1px solid #D9DEE5;font-size:13px;color:${color};text-align:${right ? "right" : "left"}">${v}</td>`;
  return `<div style="background:#f4f6fa;padding:24px 0;${F};color:${N}">
<table role="presentation" width="680" align="center" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e6e9ef">
<tr><td style="background:${N};height:28px;border-bottom:3px solid ${G}"></td></tr>
<tr><td style="padding:24px 32px 0"><table width="100%"><tr>
<td valign="top" style="font-size:44px;font-weight:700;color:${N};letter-spacing:-.5px">PAYSLIP</td>
<td valign="top" align="right"><table style="font-size:13px">${[["Payslip #", d.number], ["Payment Date", d.paymentDate], ["Pay Period", d.payPeriod], ["Working Days", String(d.workingDays)]].map(([k, v]) => `<tr><td style="color:${M};text-align:right;padding:1px 14px 1px 0">${esc(k!)}</td><td style="font-weight:700;text-align:right">${esc(v!)}</td></tr>`).join("")}</table></td>
</tr></table></td></tr>
<tr><td style="padding:24px 32px 0"><table width="100%"><tr>
<td width="50%" valign="top">${lab("Employer")}<div style="font-size:17px;font-weight:700;margin-top:6px">${esc(d.employer.name)}</div><div style="font-size:12px;margin-top:2px">${esc(d.employer.address)}</div></td>
<td width="50%" valign="top">${lab("Employee")}<div style="font-size:17px;font-weight:700;margin-top:6px">${esc(d.employee.name)}</div>
<table>${kv("Employee ID", d.employee.code)}${kv("Designation", d.employee.designation)}${kv("Department", d.employee.department)}${kv("Joining Date", d.joiningDate)}</table></td></tr></table></td></tr>
<tr><td style="padding:20px 32px 0"><table width="100%" cellpadding="0" cellspacing="0">
<tr>${head("Description", false)}${head("Hours")}${head("Rate")}${head("Amount")}${head("YTD")}${head("Type")}</tr>
${d.lines.map((l) => `<tr>${cell(esc(l.label), false)}${cell(l.hours != null ? n2(l.hours) : "")}${cell(l.rate != null ? n2(l.rate) : "")}${cell(n2(l.amount))}${cell(n2(l.ytd))}${cell(esc(l.type), true, M)}</tr>`).join("")}
</table></td></tr>
<tr><td style="padding:14px 32px 0" align="right"><table cellpadding="0" cellspacing="0" style="width:290px">
<tr><td style="padding:9px 8px;border-bottom:1px solid #D9DEE5;font-size:13px;color:${M}">Gross Pay</td><td style="padding:9px 8px;border-bottom:1px solid #D9DEE5;font-size:13px;text-align:right">${n2(d.gross)}</td></tr>
<tr><td style="padding:9px 8px;border-bottom:1px solid #D9DEE5;font-size:13px;color:${M}">Deductions / Tax</td><td style="padding:9px 8px;border-bottom:1px solid #D9DEE5;font-size:13px;text-align:right">${n2(d.totalDeductions)}</td></tr>
<tr><td style="padding:12px 8px;background:#F1F3F6;border-left:3px solid ${G};font-size:13px;font-weight:700">NET PAY</td><td style="padding:12px 8px;background:#F1F3F6;font-size:19px;font-weight:700;text-align:right">${n2(d.net)}</td></tr>
</table></td></tr>
<tr><td style="padding:26px 32px 0">${lab("Payment Detail")}<table style="margin-top:6px">${kv("Payment Method", d.payment.method, "190px")}${kv("Bank Name", d.payment.bank, "190px")}${kv("IBAN / Account Number", d.payment.account, "190px")}${kv("Branch", d.payment.branch, "190px")}</table>
<p style="margin:20px 0 0"><a href="${esc(link)}" style="display:inline-block;background:${N};color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:10px 18px;border-radius:6px">Open / download PDF</a></p>
<p style="margin:10px 0 0;font-size:11px;color:#6B7280">Button not working? Copy this link into your browser:<br><a href="${esc(link)}" style="color:${N};word-break:break-all">${esc(link)}</a></p></td></tr>
<tr><td style="padding:28px 32px 22px"><div style="border-top:1px solid #9aa3b2;padding-top:8px;text-align:center;font-size:11px;color:${M}">This is a computer-generated payslip and is confidential.</div><div style="text-align:center;font-size:11px;font-weight:700;margin-top:8px">${esc(d.employer.name)}</div></td></tr>
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
