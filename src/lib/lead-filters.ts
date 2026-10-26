import type { Prisma } from "@prisma/client";
import { addDays, startOfDay, startOfMonth, startOfWeek, subDays } from "date-fns";
import { scopeWhere } from "./permissions";
import type { SessionUser } from "./auth";
import { phoneKey } from "./crm-shared";

import type { LeadFilters } from "./lead-filters-shared";

export * from "./lead-filters-shared";

const list = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

function dateRange(preset?: string, from?: string, to?: string): { gte?: Date; lt?: Date } | null {
  const today = startOfDay(new Date());
  switch (preset) {
    case "today": return { gte: today };
    case "yesterday": return { gte: subDays(today, 1), lt: today };
    case "week": return { gte: startOfWeek(today, { weekStartsOn: 1 }) };
    case "month": return { gte: startOfMonth(today) };
    case "7d": return { gte: subDays(today, 6) };
    case "30d": return { gte: subDays(today, 29) };
    case "custom": {
      const f = from ? new Date(`${from}T00:00:00`) : null;
      const t = to ? addDays(new Date(`${to}T00:00:00`), 1) : null;
      return { ...(f && !Number.isNaN(+f) && { gte: f }), ...(t && !Number.isNaN(+t) && { lt: t }) };
    }
    default: return null;
  }
}

/** Prisma filter for the lead list: the user's scope AND every active filter. */
export async function leadWhere(user: SessionUser, f: LeadFilters, statuses: { id: string; kind: string }[]): Promise<Prisma.LeadWhereInput> {
  const scope = (await scopeWhere(user, "crm.leads")) as Prisma.LeadWhereInput;
  const and: Prisma.LeadWhereInput[] = [scope];
  const now = new Date();

  const stages = list(f.stage);
  if (stages.length) and.push({ statusId: { in: stages } });
  else if (f.group !== "all") {
    const kinds = f.group === "converted" ? ["converted"] : f.group === "junk" ? ["junk"] : ["open"];
    and.push({ statusId: { in: statuses.filter((s) => kinds.includes(s.kind)).map((s) => s.id) } });
  }

  const q = f.q?.trim();
  if (q) {
    const key = phoneKey(q);
    and.push({ OR: [{ name: { contains: q } }, { email: { contains: q } }, { location: { contains: q } }, { sourceInfo: { contains: q } }, { phones: { contains: q } }, { emails: { contains: q } }, ...(key && key.length >= 4 ? [{ phoneKey: { contains: key } }] : []), ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : [])] });
  }
  if (f.name?.trim()) and.push({ name: { contains: f.name.trim() } });
  if (f.phone?.trim()) {
    const key = phoneKey(f.phone);
    and.push({ OR: [{ phone: { contains: f.phone.trim() } }, ...(key ? [{ phoneKey: { contains: key } }, { phone2: { contains: key } }] : [])] });
  }
  if (list(f.project).length) and.push({ projectId: { in: list(f.project) } });
  if (list(f.source).length) and.push({ sourceId: { in: list(f.source) } });
  const owners = list(f.owner).map((o) => (o === "me" ? user.id : o));
  if (owners.length) and.push({ ownerId: { in: owners } });

  const open = { doneAt: null, dueAt: { not: null } };
  if (f.activity === "overdue") and.push({ activities: { some: { doneAt: null, dueAt: { lt: now } } } });
  else if (f.activity === "today") and.push({ activities: { some: { doneAt: null, dueAt: { gte: startOfDay(now), lt: addDays(startOfDay(now), 1) } } } });
  else if (f.activity === "planned") and.push({ activities: { some: open } });
  else if (f.activity === "none") and.push({ activities: { none: open } });

  const stale = Number(f.stale);
  if (stale > 0) {
    const cutoff = subDays(now, stale);
    and.push({ OR: [{ lastActivityAt: { lt: cutoff } }, { lastActivityAt: null, createdAt: { lt: cutoff } }] });
  }
  if (f.reshuffled) and.push({ reshuffledAt: { not: null } });
  const created = dateRange(f.created, f.cfrom, f.cto);
  if (created) and.push({ createdAt: created });
  const modified = dateRange(f.modified, f.mfrom, f.mto);
  if (modified) and.push({ updatedAt: modified });

  return { AND: and };
}
