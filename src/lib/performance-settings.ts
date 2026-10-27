// Assessment settings (Assessment → Settings): appraisal defaults and probation criteria, stored as settings.
import { addMonths } from "date-fns";
import { db } from "./db";
import { addEvent } from "./hr";
import { notify } from "./notify";

export const PERF_KEYS = {
  selfReview: "perf.selfReview",
  goalsTemplate: "perf.goalsTemplate",
  probationCriteria: "perf.probationCriteria",
  probationReminderDays: "perf.probationReminderDays",
} as const;

const DEFAULT_CRITERIA = ["Attendance & punctuality", "Quality of work", "Product & market knowledge", "Teamwork & attitude", "Learning & initiative"];

export async function perfSettings() {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(PERF_KEYS) } } });
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  return {
    selfReview: get(PERF_KEYS.selfReview) !== "off",
    goalsTemplate: get(PERF_KEYS.goalsTemplate) ?? "",
    probationCriteria: (get(PERF_KEYS.probationCriteria) ?? DEFAULT_CRITERIA.join("\n")).split("\n").map((s) => s.trim()).filter(Boolean),
    probationReminderDays: Number(get(PERF_KEYS.probationReminderDays) ?? 14) || 14,
  };
}

/** HR's decision on a probation review: confirm, extend or terminate (puts the employee on notice). */
export async function decideProbation(reviewId: string, decision: "confirm" | "extend" | "terminate", actorId: string, extendMonths?: number) {
  const r = await db.probationReview.findUnique({ where: { id: reviewId }, include: { employee: true } });
  if (!r || r.status !== "submitted" || r.employee.status !== "probation") return { error: "This review was already decided or the employee is no longer on probation." };
  const e = r.employee;
  if (decision === "confirm") {
    await db.employee.update({ where: { id: e.id }, data: { status: "active", confirmedAt: new Date() } });
    await addEvent(e.id, "confirmed", "Confirmed after probation", { byId: actorId, details: `Probation review score ${r.overall.toFixed(1)}/5` });
    await notify(e.userId, "Your employment has been confirmed", { link: "/me", email: true });
  } else if (decision === "extend") {
    const months = Math.max(1, Math.min(6, extendMonths ?? r.extendMonths ?? 3));
    const end = addMonths(e.probationEnd ?? new Date(), months);
    await db.employee.update({ where: { id: e.id }, data: { probationEnd: end } });
    await addEvent(e.id, "note", `Probation extended by ${months} month${months === 1 ? "" : "s"}`, { byId: actorId, details: r.comments });
    await notify(e.userId, "Your probation has been extended", { body: `New end date: ${end.toDateString()}`, link: "/me" });
  } else {
    const lastDay = new Date();
    lastDay.setDate(lastDay.getDate() + 7); // one week's notice
    await db.employee.update({ where: { id: e.id }, data: { status: "notice", exitType: "terminated", noticeDate: new Date(), lastWorkingDay: lastDay, exitReason: "Probation not successful" } });
    await addEvent(e.id, "resigned", "Employment ended after probation", { byId: actorId, details: r.comments });
  }
  await db.probationReview.update({ where: { id: r.id }, data: { status: "decided", decision, decidedById: actorId, decidedAt: new Date(), ...(decision === "extend" && { extendMonths: extendMonths ?? r.extendMonths }) } });
  return { ok: true as const };
}
