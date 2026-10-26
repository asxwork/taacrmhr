import Link from "next/link";
import type { Prisma } from "@prisma/client";
import {
  addDays, addMonths, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, parse, startOfDay,
  startOfMonth, startOfWeek, subDays, subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, ListChecks, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { TIMELINE_INCLUDE, assignableUsers, editableActivityIds, usersInScope } from "@/lib/crm";
import { cn } from "@/lib/utils";
import { Card, Drawer, LinkButton, PageHeader } from "@/components/ui";
import { hrefWith } from "@/components/crm/bits";
import { Composer } from "@/components/crm/composer";
import { Timeline, type TimelineItem } from "@/components/crm/timeline";

export const metadata = { title: "Tasks & Calendar" };

type SP = { view?: string; who?: string; month?: string; new?: string };

const RELATED = {
  lead: { select: { id: true, name: true } },
  deal: { select: { id: true, title: true } },
  contact: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
} as const;

type Related = { lead: { id: string; name: string } | null; deal: { id: string; title: string } | null; contact: { id: string; name: string } | null; company: { id: string; name: string } | null };
function context(a: Related) {
  if (a.deal) return { label: a.deal.title, href: `/crm/deals/${a.deal.id}` };
  if (a.lead) return { label: a.lead.name, href: `/crm/leads/${a.lead.id}` };
  if (a.contact) return { label: a.contact.name, href: `/crm/contacts/${a.contact.id}` };
  if (a.company) return { label: a.company.name, href: `/crm/companies/${a.company.id}` };
  return null;
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("crm.activities");
  const sp = await searchParams;
  const view = sp.view === "calendar" ? "calendar" : "day";
  const keep = { view: sp.view, who: sp.who, month: sp.month };
  const path = "/crm/tasks";

  const [scope, people] = await Promise.all([scopeWhere(user, "crm.activities"), usersInScope(user, "crm.activities", "view")]);
  // Default to my own items; managers can switch to their whole scope or one person.
  const who = sp.who ?? user.id;
  const ownerFilter: Prisma.ActivityWhereInput = who === "all" ? {} : { ownerId: people.some((p) => p.id === who) ? who : user.id };
  const base: Prisma.ActivityWhereInput = { ...scope, ...ownerFilter, dueAt: { not: null } };

  const now = new Date();
  let body: React.ReactNode;

  if (view === "day") {
    const [open, done] = await Promise.all([
      db.activity.findMany({ where: { ...base, doneAt: null }, include: { ...TIMELINE_INCLUDE, ...RELATED }, orderBy: { dueAt: "asc" }, take: 300 }),
      db.activity.findMany({ where: { ...base, doneAt: { gte: subDays(now, 7) } }, include: { ...TIMELINE_INCLUDE, ...RELATED }, orderBy: { doneAt: "desc" }, take: 30 }),
    ]);
    const editable = await editableActivityIds(user, [...open, ...done].map((a) => a.id));
    const toItem = (a: (typeof open)[number]): TimelineItem => ({ ...a, context: context(a) });
    const groups: [string, TimelineItem[], string?][] = [
      ["Overdue", open.filter((a) => a.dueAt! < startOfDay(now)).map(toItem), "text-red-600"],
      ["Today", open.filter((a) => a.dueAt! >= startOfDay(now) && a.dueAt! <= endOfDay(now)).map(toItem)],
      ["Tomorrow", open.filter((a) => isSameDay(a.dueAt!, addDays(now, 1))).map(toItem)],
      ["Later", open.filter((a) => a.dueAt! > endOfDay(addDays(now, 1))).map(toItem)],
      ["Done in the last 7 days", done.map(toItem)],
    ];
    body = (
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map(([title, items, tone]) => (
          <Card key={title} className={cn("p-5", title === "Done in the last 7 days" && "lg:col-span-2")}>
            <h2 className={cn("mb-3 text-sm font-medium", tone)}>
              {title} <span className="text-muted">{items.length}</span>
            </h2>
            {items.length === 0 ? (
              <p className="text-sm text-muted">Nothing here.</p>
            ) : (
              <Timeline items={items} path={path} editableIds={editable} canDelete={user.isSuperAdmin} />
            )}
          </Card>
        ))}
      </div>
    );
  } else {
    const month = sp.month ? parse(sp.month, "yyyy-MM", now) : now;
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const items = await db.activity.findMany({
      where: { ...base, dueAt: { gte: gridStart, lte: gridEnd } },
      include: RELATED,
      orderBy: { dueAt: "asc" },
    });
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    body = (
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <Link href={hrefWith(path, keep, { month: format(subMonths(month, 1), "yyyy-MM") })} className="rounded p-1 text-muted hover:bg-canvas"><ChevronLeft className="size-4" /></Link>
          <span className="font-medium">{format(month, "MMMM yyyy")}</span>
          <Link href={hrefWith(path, keep, { month: format(addMonths(month, 1), "yyyy-MM") })} className="rounded p-1 text-muted hover:bg-canvas"><ChevronRight className="size-4" /></Link>
        </div>
        <div className="grid grid-cols-7 border-b border-line bg-canvas/60 text-center text-xs font-medium text-muted">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayItems = items.filter((a) => isSameDay(a.dueAt!, day));
            return (
              <div key={day.toISOString()} className={cn("min-h-28 border-b border-r border-line p-1.5 text-xs [&:nth-child(7n)]:border-r-0", !isSameMonth(day, month) && "bg-canvas/50 text-muted")}>
                <span className={cn("mb-1 inline-flex size-6 items-center justify-center rounded-full", isSameDay(day, now) && "bg-navy-900 font-medium text-white")}>{format(day, "d")}</span>
                <ul className="space-y-1">
                  {dayItems.slice(0, 4).map((a) => {
                    const ctx = context(a);
                    return (
                      <li key={a.id}>
                        <Link
                          href={ctx?.href ?? path}
                          title={`${a.subject}${ctx ? ` · ${ctx.label}` : ""}`}
                          className={cn(
                            "block truncate rounded px-1.5 py-0.5",
                            a.doneAt ? "bg-canvas text-muted line-through" : a.type === "visit" ? "bg-teal-50 text-teal-800" : a.type === "meeting" ? "bg-violet-50 text-violet-800" : "bg-gold-100 text-gold-700",
                          )}
                        >
                          {format(a.dueAt!, "HH:mm")} {a.subject}
                        </Link>
                      </li>
                    );
                  })}
                  {dayItems.length > 4 && <li className="px-1.5 text-muted">+{dayItems.length - 4} more</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  const actOwners = sp.new ? await assignableUsers(user, "crm.activities") : [];

  return (
    <>
      <PageHeader
        title="Tasks & Calendar"
        description="Follow-ups, meetings and site visits."
        actions={
          <>
            <div className="flex rounded-lg bg-black/5 p-0.5">
              <Link href={hrefWith(path, keep, { view: undefined })} className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm", view === "day" ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
                <ListChecks className="size-4" /> My day
              </Link>
              <Link href={hrefWith(path, keep, { view: "calendar" })} className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm", view === "calendar" ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
                <CalendarDays className="size-4" /> Calendar
              </Link>
            </div>
            {can(user, "crm.activities", "create") && (
              <LinkButton href={hrefWith(path, keep, { new: "1" })} scroll={false} prefetch>
                <Plus className="size-4" /> New task
              </LinkButton>
            )}
          </>
        }
      />

      {people.length > 1 && (
        <form className="mb-4 flex gap-2">
          {sp.view && <input type="hidden" name="view" value={sp.view} />}
          {sp.month && <input type="hidden" name="month" value={sp.month} />}
          <select name="who" defaultValue={who} className="input w-48">
            <option value={user.id}>Mine</option>
            <option value="all">Everyone I manage</option>
            {people.filter((p) => p.id !== user.id).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button className="h-9 rounded-md border border-line bg-surface px-3 text-sm hover:bg-canvas">Show</button>
        </form>
      )}

      {body}

      {sp.new && (
        <Drawer title="New task" closeHref={hrefWith(path, keep, {})}>
          <p className="mb-3 text-sm text-muted">A personal task. To link it to a client, add it from the lead or deal page instead.</p>
          <Composer entity={{}} path={path} users={actOwners} currentUserId={user.id} types={["task", "meeting", "visit"]} />
        </Drawer>
      )}
    </>
  );
}
