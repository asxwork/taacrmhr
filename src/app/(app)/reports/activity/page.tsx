import Link from "next/link";
import { format, startOfDay, subDays } from "date-fns";
import { CalendarCheck, FilePen, MapPin, Phone, StickyNote } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { usersInScope } from "@/lib/crm";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";

export const metadata = { title: "Activity feed" };

type Item = { at: Date; icon: React.ReactNode; text: React.ReactNode };

/** Reports → Activity feed: everything one person did — calls, notes, visits, changes — day by day. */
export default async function ActivityFeedPage({ searchParams }: { searchParams: Promise<{ user?: string; days?: string }> }) {
  const me = await requirePermission("reports.activity");
  const sp = await searchParams;
  const people = await usersInScope(me, "reports.activity", "view");
  const who = people.find((p) => p.id === sp.user) ?? people.find((p) => p.id === me.id) ?? people[0];
  const days = [1, 7, 30].includes(Number(sp.days)) ? Number(sp.days) : 7;
  const since = startOfDay(subDays(new Date(), days - 1));
  const items: Item[] = [];
  if (who) {
    const [acts, audits, calls] = await Promise.all([
      db.activity.findMany({ where: { createdById: who.id, createdAt: { gte: since } }, select: { type: true, subject: true, createdAt: true, checkInAt: true, lead: { select: { id: true, name: true } }, deal: { select: { id: true, title: true } } }, orderBy: { createdAt: "desc" }, take: 300 }),
      db.auditLog.findMany({ where: { userId: who.id, createdAt: { gte: since } }, select: { summary: true, action: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 300 }),
      db.callLog.findMany({ where: { agentId: who.id, startedAt: { gte: since } }, select: { outcome: true, startedAt: true, target: { select: { name: true, phone: true } } }, orderBy: { startedAt: "desc" }, take: 300 }),
    ]);
    const icon = (t: string) => t === "call" ? <Phone className="size-4 text-emerald-600" /> : t === "visit" ? <MapPin className="size-4 text-violet-600" /> : t === "meeting" ? <CalendarCheck className="size-4 text-sky-600" /> : <StickyNote className="size-4 text-amber-600" />;
    for (const a of acts) items.push({
      at: a.createdAt, icon: icon(a.type),
      text: <>{a.subject}{a.lead && <> · <Link href={`/crm/leads/${a.lead.id}`} className="text-navy-900 hover:underline">{a.lead.name}</Link></>}{a.deal && <> · <Link href={`/crm/deals/${a.deal.id}`} className="text-navy-900 hover:underline">{a.deal.title}</Link></>}{a.checkInAt && <span className="text-emerald-700"> · checked in 📍</span>}</>,
    });
    for (const c of calls) items.push({ at: c.startedAt, icon: <Phone className="size-4 text-emerald-600" />, text: <>Call: {c.target?.name ?? c.target?.phone ?? "number"} — {c.outcome}</> });
    for (const a of audits) items.push({ at: a.createdAt, icon: <FilePen className="size-4 text-muted" />, text: a.summary });
    items.sort((x, y) => +y.at - +x.at);
  }
  const byDay = new Map<string, Item[]>();
  for (const i of items) { const k = format(i.at, "EEEE d MMM"); byDay.set(k, [...(byDay.get(k) ?? []), i]); }

  return (
    <>
      <PageHeader title="Activity feed" description="Everything one person did: calls, notes, meetings, site visits and changes they made in AMS." />
      <AutoFilterForm className="mb-6 flex flex-wrap gap-2">
        <select name="user" defaultValue={who?.id ?? ""} className="input w-56">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select name="days" defaultValue={String(days)} className="input w-40"><option value="1">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select>
      </AutoFilterForm>
      {items.length === 0 ? <Card><EmptyState title="Nothing in this period" /></Card> : (
        <div className="space-y-4">
          {[...byDay].map(([day, list]) => (
            <Card key={day} className="overflow-hidden">
              <p className="border-b border-line bg-canvas/60 px-4 py-2 text-sm font-medium">{day} <span className="font-normal text-muted">· {list.length}</span></p>
              <ul className="divide-y divide-line">
                {list.map((i, n) => <li key={n} className="flex items-start gap-3 px-4 py-2 text-sm"><span className="mt-0.5">{i.icon}</span><span className="min-w-0 flex-1">{i.text}</span><span className="text-xs tabular-nums text-muted">{format(i.at, "h:mm a")}</span></li>)}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
