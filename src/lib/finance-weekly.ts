// Finance part of the Monday summary for the owner: last week's spending, biggest expenses, missing bills, bills due, cash.
import { addDays, format, startOfDay, subDays } from "date-fns";
import { db } from "./db";
import { notify } from "./notify";
import { loadUserById } from "./auth";
import { can } from "./permissions";
import { balances, billsForMonth, companyExpense, lakh, pkr, PROOF_WHERE } from "./finance";

export async function financeWeekly(today = new Date()) {
  const to = startOfDay(today), from = subDays(to, 7), prevFrom = subDays(from, 7);
  const [week, prev, top, noBill, holders, bills] = await Promise.all([
    db.finEntry.aggregate({ where: companyExpense({ date: { gte: from, lt: to } }), _sum: { amount: true }, _count: true }),
    db.finEntry.aggregate({ where: companyExpense({ date: { gte: prevFrom, lt: from } }), _sum: { amount: true } }),
    db.finEntry.findMany({ where: companyExpense({ date: { gte: from, lt: to } }), orderBy: { amount: "desc" }, take: 5, include: { account: true } }),
    db.finEntry.aggregate({ where: companyExpense({ ...PROOF_WHERE.missing, date: { gte: from, lt: to } }), _count: true, _sum: { amount: true } }),
    balances(),
    billsForMonth(to),
  ]);
  const spent = week._sum.amount ?? 0, before = prev._sum.amount ?? 0;
  const change = before ? Math.round(((spent - before) / before) * 100) : null;
  const cash = holders.filter((h) => h.kind !== "owner" && h.balance > 0).reduce((s, h) => s + h.balance, 0);
  const due = bills.filter((b) => !b.paid && b.due <= addDays(to, 7));
  const lines = [
    `Week of ${format(from, "d MMM")} – ${format(subDays(to, 1), "d MMM yyyy")}`,
    "",
    "FINANCE",
    `• Company spent: ${lakh(spent)} (${week._count} entries)${change != null ? ` · ${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% vs the week before (${lakh(before)})` : ""}`,
    ...(top.length ? ["• Biggest expenses:", ...top.map((e) => `   – ${pkr(e.amount)} · ${e.description} (${e.account.name})`)] : []),
    `• Without a bill: ${noBill._count} entries (${pkr(noBill._sum.amount ?? 0)})`,
    due.length ? `• Bills due this week: ${due.map((b) => `${b.name} ${pkr(b.amount)}`).join(", ")}` : "• No bills due this week",
    `• Cash with staff now: ${lakh(cash)}`,
  ];
  return { title: `Finance: ${lakh(spent)} spent last week${noBill._count ? `, ${noBill._count} without a bill` : ""}`, body: lines.join("\n") };
}

/** Everyone with Finance: boss dashboard (and the Boss) gets it on Mondays, by email and notification. */
export async function sendFinanceWeekly(force = false) {
  if (!force && new Date().getDay() !== 1) return 0;
  if (!(await db.finEntry.count())) return 0;
  const users = await db.user.findMany({ where: { active: true }, select: { id: true } });
  let summary: Awaited<ReturnType<typeof financeWeekly>> | null = null;
  let sent = 0;
  for (const { id } of users) {
    const u = await loadUserById(id);
    if (!u || !(u.isBoss || can(u, "finance.boss"))) continue;
    summary ??= await financeWeekly();
    await notify(id, summary.title, { body: summary.body, link: "/finance/boss", email: true });
    sent++;
  }
  return sent;
}

/** Instant alert to the owner for a single big expense (Finance → Settings → Alert me for expenses from). */
export async function alertBigExpense(entry: { id: string; amount: number; description: string }, byName: string, alertAbove: number) {
  if (!alertAbove || entry.amount < alertAbove) return;
  const users = await db.user.findMany({ where: { active: true }, select: { id: true } });
  for (const { id } of users) {
    const u = await loadUserById(id);
    if (u && (u.isBoss || can(u, "finance.boss"))) await notify(id, `Big expense: ${pkr(entry.amount)}`, { body: `${entry.description} — by ${byName}`, link: `/finance/entries/${entry.id}` });
  }
}
