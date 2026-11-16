// Scheduled attendance reports: daily (yesterday), weekly on Monday (last 7 days) and monthly on the 1st (last month).
// Each recipient gets a notification + email with the headline numbers and a link that opens the full report with
// the same filters (the data itself stays in AMS; nothing personal is attached to the email).
import type { AttReportPreset } from "@prisma/client";
import { endOfMonth, format, getISODay, isSameDay, startOfDay, startOfMonth, subDays, subMonths } from "date-fns";
import { db } from "./db";
import { notify } from "./notify";
import { loadUserById } from "./auth";
import { attendanceEmployeeWhere } from "./attendance";
import { filtersQuery, runTemplate, templateByKey, type AttFilters } from "./attendance-templates";

function windowFor(schedule: string, now: Date) {
  const d = startOfDay(now);
  if (schedule === "monthly") { const m = subMonths(d, 1); return { from: startOfMonth(m), to: startOfDay(endOfMonth(m)) }; }
  if (schedule === "weekly") return { from: subDays(d, 7), to: subDays(d, 1) };
  return { from: subDays(d, 1), to: subDays(d, 1) };
}

export async function sendAttPreset(p: AttReportPreset, now: Date) {
  const t = templateByKey(p.template);
  if (!t) return;
  const owner = await loadUserById(p.createdById);
  if (!owner) return;
  let saved: AttFilters = {};
  try { saved = JSON.parse(p.filters); } catch {}
  const w = windowFor(p.schedule ?? "daily", now);
  const f: AttFilters = { ...saved, period: undefined, from: format(w.from, "yyyy-MM-dd"), to: format(w.to, "yyyy-MM-dd") };
  // Run with the owner's scope so a schedule never shows more than its owner can see.
  const out = await runTemplate(t.key, f, (await attendanceEmployeeWhere(owner)) ?? { id: "none" });
  const span = f.from === f.to ? format(w.from, "EEE d MMM") : `${format(w.from, "d MMM")} – ${format(w.to, "d MMM")}`;
  const link = `/hr/attendance/reports/${t.key}?${filtersQuery(f)}`;
  const body = `${t.name} for ${span}: ${out.rows.length} row${out.rows.length === 1 ? "" : "s"}. Open AMS to see the full report, print it or download it.`;
  for (const uid of (p.recipients ?? p.createdById).split(",").filter(Boolean)) {
    await notify(uid, `${p.name} · ${span}`, { body, link, email: true, category: "hr" }).catch(() => {});
  }
  await db.attReportPreset.update({ where: { id: p.id }, data: { lastSentAt: now } });
}

/** Daily job: send every scheduled preset that is due today (once a day). */
export async function sendDueAttReports(now = new Date()) {
  const presets = await db.attReportPreset.findMany({ where: { schedule: { not: null } } });
  let sent = 0;
  for (const p of presets) {
    if (p.lastSentAt && isSameDay(p.lastSentAt, now)) continue;
    if (p.schedule === "weekly" && getISODay(now) !== 1) continue;
    if (p.schedule === "monthly" && now.getDate() !== 1) continue;
    await sendAttPreset(p, now).catch(() => {});
    sent++;
  }
  return sent;
}
