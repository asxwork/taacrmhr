// HR dashboard widgets an admin can hide (System Settings → Customization → Dashboard).
import { db } from "./db";

export const DASHBOARD_WIDGETS = [
  { key: "drill", label: "Attendance drill-down" },
  { key: "risers", label: "Early risers & late comers" },
  { key: "kpis", label: "Separation & confirmation tiles" },
  { key: "me", label: "Clock in/out, leave summary & clock" },
  { key: "posts", label: "Accolades, news letter & words of wisdom" },
  { key: "summary", label: "My attendance summary & check-in trend" },
  { key: "absents", label: "Month-wise absents" },
  { key: "people", label: "Birthdays, my team, new joiners & anniversaries" },
  { key: "headcount", label: "Head count charts" },
  { key: "money", label: "Attrition, expense report & monthly attendance" },
  { key: "gender", label: "Gender head count & company policies" },
  { key: "support", label: "Support email & joiners by gender" },
] as const;
export type WidgetKey = (typeof DASHBOARD_WIDGETS)[number]["key"];

export async function hiddenWidgets() {
  const v = (await db.setting.findUnique({ where: { key: "hr.dashboard.hidden" } }))?.value ?? "";
  return new Set(v.split(",").filter(Boolean) as WidgetKey[]);
}
