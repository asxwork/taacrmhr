// Finance reports for the boss: profit & loss, cash-flow forecast and marketing cost per lead.
// Income = client installments received in the CRM + Finance "money in" entries that have a category.
// Money in without a category (e.g. "Petty cash received" from the owner) is funding, not income.
import { addDays, endOfMonth, format, startOfDay, startOfMonth } from "date-fns";
import { db } from "./db";
import { balances, companyExpense } from "./finance";

export type PnlMonth = { key: string; label: string; installments: number; otherIncome: number; funding: number; expenses: Map<string, number>; totalExpense: number; net: number };

/** Month by month for a year: income, spending by main category, and what's left. */
export async function profitAndLoss(year: number) {
  const from = new Date(year, 0, 1), to = new Date(year, 11, 31, 23, 59, 59);
  const [inst, ins, exp, cats] = await Promise.all([
    db.installment.findMany({ where: { paidAt: { gte: from, lte: to }, paidAmount: { gt: 0 } }, select: { paidAt: true, paidAmount: true } }),
    db.finEntry.findMany({ where: { kind: "in", status: "approved", personal: false, date: { gte: from, lte: to } }, select: { date: true, amount: true, categoryId: true } }),
    db.finEntry.findMany({ where: companyExpense({ date: { gte: from, lte: to } }), select: { date: true, amount: true, categoryId: true } }),
    db.finCategory.findMany({ select: { id: true, name: true, parentId: true } }),
  ]);
  const top = (id: string | null) => {
    let c = cats.find((x) => x.id === id);
    while (c?.parentId) c = cats.find((x) => x.id === c!.parentId);
    return c?.name ?? "Other";
  };
  const months: PnlMonth[] = Array.from({ length: 12 }, (_, m) => ({ key: format(new Date(year, m, 1), "yyyy-MM"), label: format(new Date(year, m, 1), "MMM"), installments: 0, otherIncome: 0, funding: 0, expenses: new Map(), totalExpense: 0, net: 0 }));
  for (const i of inst) months[i.paidAt!.getMonth()]!.installments += i.paidAmount;
  for (const e of ins) { const m = months[e.date.getMonth()]!; if (e.categoryId) m.otherIncome += e.amount; else m.funding += e.amount; }
  const catTotals = new Map<string, number>();
  for (const e of exp) {
    const m = months[e.date.getMonth()]!, name = top(e.categoryId);
    m.expenses.set(name, (m.expenses.get(name) ?? 0) + e.amount);
    m.totalExpense += e.amount;
    catTotals.set(name, (catTotals.get(name) ?? 0) + e.amount);
  }
  for (const m of months) m.net = m.installments + m.otherIncome - m.totalExpense;
  const categories = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const sum = (f: (m: PnlMonth) => number) => months.reduce((s, m) => s + f(m), 0);
  return { months, categories, totals: { installments: sum((m) => m.installments), otherIncome: sum((m) => m.otherIncome), funding: sum((m) => m.funding), expense: sum((m) => m.totalExpense), net: sum((m) => m.net) } };
}

export type ForecastLine = { date: Date; label: string; amount: number; kind: "in" | "out"; source: string; href?: string };

/**
 * The next N days: cash now (petty cash, people and banks; not the owner or company cards), plus client installments
 * due, minus monthly bills, supplier bills and payroll. Week by week with a running balance.
 */
export async function cashForecast(days = 90) {
  const today = startOfDay(new Date()), until = addDays(today, days);
  const [holders, inst, recurring, payables, lastPayroll] = await Promise.all([
    balances(),
    db.installment.findMany({ where: { dueDate: { lte: until } }, include: { plan: { select: { deal: { select: { id: true, title: true } } } } } }),
    db.finRecurring.findMany({ where: { active: true } }),
    db.finPayable.findMany({ where: { status: "open" } }),
    db.payrollRun.findFirst({ where: { status: { in: ["approved", "paid"] } }, orderBy: { month: "desc" }, include: { payslips: { select: { net: true } } } }),
  ]);
  const cash = holders.filter((h) => h.active && ["petty", "person", "bank"].includes(h.kind) && h.balance > 0).reduce((s, h) => s + h.balance, 0);
  const lines: ForecastLine[] = [];
  let overdueIn = 0;
  for (const i of inst) {
    const left = i.amount - (i.paidAmount ?? 0);
    if (left <= 0.5) continue;
    if (i.dueDate < today) { overdueIn += left; continue; } // late money isn't counted as coming; shown separately
    lines.push({ date: i.dueDate, label: `${i.plan.deal.title} · ${i.label}`, amount: left, kind: "in", source: "Installment", href: `/crm/deals/${i.plan.deal.id}` });
  }
  for (let d = startOfMonth(today); d <= until; d = startOfMonth(addDays(endOfMonth(d), 1))) {
    for (const r of recurring) {
      const day = new Date(d.getFullYear(), d.getMonth(), Math.min(r.dayOfMonth, endOfMonth(d).getDate()));
      if (day >= today && day <= until && r.lastPaid !== format(day, "yyyy-MM")) lines.push({ date: day, label: r.name, amount: r.amount, kind: "out", source: "Monthly bill", href: "/finance/bills" });
    }
    const payDay = new Date(d.getFullYear(), d.getMonth() + 1, 1); // salaries go out at the start of the next month
    const payroll = lastPayroll?.payslips.reduce((s, p) => s + p.net, 0) ?? 0;
    if (payroll > 0 && payDay >= today && payDay <= until) lines.push({ date: payDay, label: `Salaries (about the same as ${lastPayroll!.month})`, amount: payroll, kind: "out", source: "Payroll", href: "/hr/payroll" });
  }
  for (const p of payables) {
    const due = p.dueDate && p.dueDate > today ? p.dueDate : addDays(today, 7);
    if (due <= until) lines.push({ date: due, label: `${p.party}: ${p.description}`, amount: p.amount, kind: "out", source: "Supplier bill", href: "/finance/vendors" });
  }
  lines.sort((a, b) => +a.date - +b.date);
  const weeks: { start: Date; in: number; out: number; balance: number }[] = [];
  let bal = cash;
  for (let w = today; w < until; w = addDays(w, 7)) {
    const end = addDays(w, 7);
    const these = lines.filter((l) => l.date >= w && l.date < end);
    const i = these.filter((l) => l.kind === "in").reduce((s, l) => s + l.amount, 0), o = these.filter((l) => l.kind === "out").reduce((s, l) => s + l.amount, 0);
    bal += i - o;
    weeks.push({ start: w, in: i, out: o, balance: bal });
  }
  const at = (n: number) => cash + lines.filter((l) => l.date < addDays(today, n)).reduce((s, l) => s + (l.kind === "in" ? l.amount : -l.amount), 0);
  return { cash, overdueIn, lines, weeks, in30: at(30), in60: at(60), in90: at(90), lowest: Math.min(cash, ...weeks.map((w) => w.balance)) };
}

/** Lead sources a spending line can belong to, matched by words in its category, description, payee or tags. */
const SOURCE_WORDS: Record<string, RegExp> = {
  facebook: /facebook|\bfb\b|meta/i, instagram: /instagram|\binsta\b/i, zameen: /zameen/i, graana: /graana/i,
  website: /website|google ads|\bgoogle\b|seo|hosting|domain/i, whatsapp: /whatsapp/i,
};

/** Marketing spending against the leads and deals each source brought in. */
export async function marketingReturn(from: Date, to: Date) {
  const [sources, cats, spend, leads, won] = await Promise.all([
    db.leadSource.findMany({ select: { id: true, name: true } }),
    db.finCategory.findMany({ select: { id: true, name: true, parentId: true } }),
    db.finEntry.findMany({ where: companyExpense({ date: { gte: from, lte: to } }), select: { id: true, amount: true, description: true, party: true, tags: true, categoryId: true, date: true } }),
    db.lead.groupBy({ by: ["sourceId"], where: { createdAt: { gte: from, lte: to } }, _count: true }),
    db.deal.findMany({ where: { closedAt: { gte: from, lte: to }, stage: { kind: "won" } }, select: { value: true, sourceId: true, lead: { select: { sourceId: true } } } }),
  ]);
  const marketingIds = new Set<string>();
  const mk = cats.find((c) => /marketing|advert/i.test(c.name) && !c.parentId);
  for (const c of cats) if (c.id === mk?.id || c.parentId === mk?.id || /ads|advert|marketing/i.test(c.name)) marketingIds.add(c.id);
  const catName = (id: string | null) => cats.find((c) => c.id === id)?.name ?? "";
  const rows = sources.map((s) => ({ id: s.id, name: s.name, spend: 0, leads: 0, deals: 0, value: 0, lines: [] as typeof spend }));
  const unmatched: typeof spend = [];
  for (const e of spend) {
    const text = `${catName(e.categoryId)} ${e.description} ${e.party ?? ""} ${e.tags ?? ""}`;
    const isMarketing = (e.categoryId && marketingIds.has(e.categoryId)) || Object.values(SOURCE_WORDS).some((re) => re.test(text));
    if (!isMarketing) continue;
    const hit = rows.find((r) => { const re = SOURCE_WORDS[r.name.toLowerCase()]; return re ? re.test(text) : new RegExp(`\\b${r.name.replace(/[^a-z0-9]/gi, "")}\\b`, "i").test(text); });
    if (hit) { hit.spend += e.amount; hit.lines.push(e); } else unmatched.push(e);
  }
  for (const l of leads) { const r = rows.find((x) => x.id === l.sourceId); if (r) r.leads += l._count; }
  for (const d of won) { const r = rows.find((x) => x.id === (d.sourceId ?? d.lead?.sourceId)); if (r) { r.deals++; r.value += d.value ?? 0; } }
  return {
    rows: rows.filter((r) => r.spend || r.leads || r.deals).sort((a, b) => b.spend - a.spend || b.leads - a.leads),
    unmatched, unmatchedTotal: unmatched.reduce((s, e) => s + e.amount, 0),
    totalSpend: rows.reduce((s, r) => s + r.spend, 0) + unmatched.reduce((s, e) => s + e.amount, 0),
    totalLeads: leads.reduce((s, l) => s + l._count, 0), totalDeals: won.length,
  };
}

/** Boss-level Finance reports: the Boss view permission, or Finance across every office. */
export async function requireFinanceReports() {
  const { requireUser } = await import("./auth");
  const { can } = await import("./permissions");
  const { financeLimit } = await import("./finance");
  const { redirect } = await import("next/navigation");
  const user = await requireUser();
  if (!(user.isSuperAdmin || can(user, "finance.boss") || (can(user, "finance") && !financeLimit(user)))) redirect("/no-access");
  return user;
}

/** Daily: yesterday's spending checked for double entries, unusual amounts, round cash with no bill, etc. Approvers get one alert. */
export async function sendFinanceAlerts(today = new Date()) {
  const { financeChecks, financeApproverIds, pkr } = await import("./finance");
  const { notify } = await import("./notify");
  const day = addDays(startOfDay(today), -1);
  const c = await financeChecks(day, new Date(day.getTime() + 86_399_999));
  const serious = [...c.dups, ...c.repeat, ...c.unusual, ...c.roundCash];
  if (!serious.length) return 0;
  const body = serious.slice(0, 5).map((r) => `${r.description} (${pkr(r.amount)}): ${r.why}`).join("\n") + (serious.length > 5 ? `\n…and ${serious.length - 5} more` : "");
  for (const uid of await financeApproverIds()) {
    await notify(uid, `Finance check: ${serious.length} expense${serious.length === 1 ? "" : "s"} from ${format(day, "d MMM")} need a look`, { body, link: `/finance/checks?month=${format(day, "yyyy-MM")}` }).catch(() => {});
  }
  return serious.length;
}
