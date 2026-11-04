import Link from "next/link";
import { addDays, format, startOfDay } from "date-fns";
import { MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { CheckInButton } from "./check-in-button";

export const metadata = { title: "Site visits" };

const map = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

/** Leads → Site visits: today's planned visits with a GPS check-in, and the check-in log managers can verify. */
export default async function VisitsPage() {
  const user = await requirePermission("crm.visits");
  const scope = (await scopeWhere(user, "crm.visits"))!;
  const today = startOfDay(new Date());
  const canCheckIn = can(user, "crm.visits", "create");
  const select = { id: true, subject: true, dueAt: true, checkInAt: true, checkInLat: true, checkInLng: true, checkInAcc: true, owner: { select: { name: true } }, lead: { select: { id: true, name: true, project: { select: { name: true } } } } } as const;
  const [planned, log] = await Promise.all([
    db.activity.findMany({ where: { ...scope, type: "visit", doneAt: null, dueAt: { lt: addDays(today, 1) } }, select, orderBy: { dueAt: "asc" }, take: 50 }),
    db.activity.findMany({ where: { ...scope, type: "visit", checkInAt: { not: null } }, select, orderBy: { checkInAt: "desc" }, take: 60 }),
  ]);

  return (
    <>
      <PageHeader title="Site visits" description="Open this on your phone at the site and tap “Check in here” — your location and time are saved on the visit." />
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Today &amp; overdue</h2>
      <Card className="mb-6 overflow-hidden">
        {planned.length === 0 ? <EmptyState title="No site visits planned for today" description="Plan one from a lead (Site visit tab in the activity box)." /> : (
          <ul className="divide-y divide-line">
            {planned.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{v.lead ? <Link href={`/crm/leads/${v.lead.id}`} className="text-navy-900 hover:underline">{v.lead.name}</Link> : v.subject}</p>
                  <p className="truncate text-xs text-muted">{v.subject}{v.lead?.project ? ` · ${v.lead.project.name}` : ""} · {v.dueAt ? format(v.dueAt, "d MMM, h:mm a") : ""}{v.owner ? ` · ${v.owner.name}` : ""}
                    {v.dueAt && v.dueAt < today && <span className="text-red-600"> · overdue</span>}</p>
                </div>
                {canCheckIn && <CheckInButton id={v.id} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Check-ins</h2>
      <Card className="overflow-hidden">
        {log.length === 0 ? <EmptyState title="No check-ins yet" /> : (
          <ul className="divide-y divide-line">
            {log.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <MapPin className="size-4 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate"><span className="font-medium">{v.owner?.name ?? "—"}</span> at {v.lead ? <Link href={`/crm/leads/${v.lead.id}`} className="text-navy-900 hover:underline">{v.lead.name}</Link> : v.subject}{v.lead?.project ? ` · ${v.lead.project.name}` : ""}</p>
                  <p className="text-xs text-muted">{format(v.checkInAt!, "d MMM yyyy, h:mm a")}{v.checkInAcc ? ` · accurate to ~${Math.round(v.checkInAcc)} m` : ""}</p>
                </div>
                {v.checkInAcc && v.checkInAcc > 200 && <Badge tone="amber">Rough location</Badge>}
                <a href={map(v.checkInLat!, v.checkInLng!)} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-canvas">Open map</a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
