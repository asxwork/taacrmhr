// Morning summary: one "your day" notification per person with the Morning summary permission (daily cron).
// Own scope: their leads. Team / branch / all: also the totals for the people they look after.
import { addDays, format, startOfDay, subDays } from "date-fns";
import { db } from "./db";
import { notify } from "./notify";
import { loadUserById } from "./auth";
import { can, scopeFor, scopeWhere } from "./permissions";
import { disabledFeatures } from "./features";
import { overallPct, targetProgress } from "./targets";

export async function sendMorningSummaries() {
  const off = await disabledFeatures();
  if (off.has("summary")) return 0;
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const yesterday = subDays(today, 1);
  const month = format(today, "yyyy-MM");
  const users = await db.user.findMany({ where: { active: true }, select: { id: true } });
  let sent = 0;
  for (const { id } of users) {
    const user = await loadUserById(id);
    if (!user || !can(user, "crm.summary")) continue;
    const open = { status: { kind: "open" } };
    const mine = { ...open, ownerId: id };
    const [overdue, dueToday, fresh, untouched] = await Promise.all([
      db.activity.count({ where: { ownerId: id, doneAt: null, dueAt: { lt: today } } }),
      db.activity.count({ where: { ownerId: id, doneAt: null, dueAt: { gte: today, lt: tomorrow } } }),
      db.lead.count({ where: { ...mine, createdAt: { gte: yesterday } } }),
      db.lead.count({ where: { ...mine, lastActivityAt: null } }),
    ]);
    const lines = [
      `${dueToday} follow-up(s) due today${overdue ? `, ${overdue} overdue` : ""}`,
      fresh ? `${fresh} new lead(s) since yesterday` : null,
      untouched ? `${untouched} lead(s) never contacted` : null,
    ];
    if (!off.has("targets") && can(user, "crm.targets")) {
      const p = (await targetProgress([id], month)).get(id);
      const pct = p && overallPct(p);
      if (pct != null) lines.push(`Monthly target: ${pct}% done`);
    }
    if (scopeFor(user, "crm.summary") !== "own") {
      const scope = (await scopeWhere(user, "crm.summary"))!;
      const [teamNew, teamOverdue] = await Promise.all([
        db.lead.count({ where: { ...scope, createdAt: { gte: yesterday, lt: today } } }),
        db.activity.count({ where: { doneAt: null, dueAt: { lt: today }, lead: { ...scope, ...open } } }),
      ]);
      lines.push(`Your team: ${teamNew} new lead(s) yesterday, ${teamOverdue} overdue follow-up(s)`);
    }
    await notify(id, `Good morning, ${user.name.split(" ")[0]} — your day`, { body: lines.filter(Boolean).join("\n"), link: "/crm/focus", email: true });
    sent++;
  }
  return sent;
}
