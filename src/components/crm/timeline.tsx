import Link from "@/components/link";
import { format, isPast, isToday, isYesterday, startOfDay } from "date-fns";
import { CalendarCheck, CalendarClock, Check, CircleDot, Info, MapPin, MessageSquare, Phone, Plus, StickyNote, Trash2, Users, MessageCircle } from "lucide-react";
import { cn, fmtAgo } from "@/lib/utils";
import { deleteActivity, toggleActivity } from "@/app/(app)/crm/activity-actions";
import { ConfirmButton } from "@/components/confirm-button";

export type TimelineItem = {
  id: string;
  type: string;
  subject: string;
  body: string | null;
  dueAt: Date | null;
  doneAt: Date | null;
  createdAt: Date;
  owner: { name: string } | null;
  createdBy: { name: string } | null;
  createdById?: string | null;
  /** The lead / deal / contact it's about; phone shows a call link and WhatsApp (when the viewer may see it). */
  context?: { label: string; href: string; phone?: string | null; tel?: string | null; wa?: string | null } | null;
};

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  note: StickyNote, call: Phone, meeting: Users, visit: MapPin, task: CalendarCheck, email: MessageSquare, system: CircleDot,
};

const dayLabel = (d: Date) => (isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "d MMMM yyyy"));

/**
 * Bitrix-style record feed: "Things to do" (open scheduled items, soonest first) as action cards,
 * then history newest-first under day dividers. A rail of icons runs down the left.
 */
export function Timeline({ items, path, editableIds, canPlan = true, canDelete = false, myId }: { items: TimelineItem[]; path: string; editableIds: Set<string>; canPlan?: boolean; /** Delete any activity (Activities → Delete). */ canDelete?: boolean; /** The viewer: they can always delete activities they added. */ myId?: string }) {
  const mayDelete = (i: TimelineItem) => canDelete || (!!myId && i.createdById === myId);
  const open = items.filter((i) => i.dueAt && !i.doneAt).sort((a, b) => +a.dueAt! - +b.dueAt!);
  const history = items.filter((i) => !(i.dueAt && !i.doneAt)).sort((a, b) => +(b.doneAt ?? b.createdAt) - +(a.doneAt ?? a.createdAt));
  const days: { label: string; items: TimelineItem[] }[] = [];
  for (const i of history) {
    const label = dayLabel(startOfDay(i.doneAt ?? i.createdAt));
    if (days.at(-1)?.label === label) days.at(-1)!.items.push(i);
    else days.push({ label, items: [i] });
  }

  return (
    <div className="relative before:absolute before:inset-y-0 before:left-[19px] before:w-px before:bg-line">
      <Divider tone="green">Things to do</Divider>
      <ul className="space-y-3">
        {open.map((i) => <TodoCard key={i.id} item={i} path={path} editable={editableIds.has(i.id)} canDelete={mayDelete(i)} />)}
        {open.length === 0 && canPlan && (
          <li className="relative pl-14">
            <Dot className="bg-emerald-600 text-white"><Info className="size-4" /></Dot>
            <a href="#composer" className="flex items-center gap-3 rounded-xl border border-gold-300/50 bg-gold-100/50 px-4 py-3 transition hover:bg-gold-100">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Plus className="size-4" /></span>
              <span>
                <span className="block text-sm font-medium">Add a new activity</span>
                <span className="block text-xs text-muted">Plan your next step so this client is never forgotten.</span>
              </span>
            </a>
          </li>
        )}
      </ul>

      {days.length === 0 ? (
        <>
          <Divider>Today</Divider>
          <p className="relative pl-14 text-sm text-muted">No activity yet.</p>
        </>
      ) : days.map((d) => (
        <div key={d.label}>
          <Divider>{d.label}</Divider>
          <ul className="space-y-3">
            {d.items.map((i) => <HistoryRow key={i.id} item={i} path={path} editable={editableIds.has(i.id)} canDelete={mayDelete(i)} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Divider({ children, tone }: { children: React.ReactNode; tone?: "green" }) {
  return (
    <div className="relative my-5 flex items-center pl-14 first:mt-1">
      <span className="h-px flex-1 bg-line" />
      <span className={cn("mx-3 rounded-full px-3 py-0.5 text-xs font-medium", tone === "green" ? "bg-emerald-600 text-white" : "bg-navy-900 text-white")}>{children}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function Dot({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("absolute left-0 top-2 z-10 flex size-10 items-center justify-center rounded-full ring-4 ring-canvas", className)}>{children}</span>;
}

function TodoCard({ item, path, editable, canDelete }: { item: TimelineItem; path: string; editable: boolean; canDelete: boolean }) {
  const Icon = ICON[item.type] ?? CalendarCheck;
  const overdue = isPast(item.dueAt!);
  return (
    <li className="relative pl-14">
      <Dot className={overdue ? "bg-red-500 text-white" : "bg-gold-600 text-white"}><Icon className="size-4" /></Dot>
      <div className={cn("rounded-xl border bg-surface p-4 shadow-xs", overdue ? "border-red-200" : "border-line")}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-sm font-semibold">{item.subject}</p>
          <p className="text-xs text-muted">{fmtAgo(item.createdAt)}{item.owner ? ` · for ${item.owner.name}` : ""}</p>
        </div>
        <p className={cn("mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium", overdue ? "bg-red-50 text-red-700" : "bg-canvas text-ink/80")}>
          <CalendarClock className="size-3.5" />
          {overdue ? "Overdue · " : "Deadline "}{format(item.dueAt!, "EEE, d MMM, h:mm a")}
        </p>
        {item.body && item.body !== item.subject && <p className="mt-2 whitespace-pre-line rounded-lg border border-line bg-canvas/50 px-3 py-2 text-sm">{item.body}</p>}
        {item.context && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Link href={item.context.href} className="font-medium text-navy-900 hover:underline">{item.context.label}</Link>
            {item.context.phone && (item.context.tel
              ? <a href={item.context.tel} className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-ink/80 hover:text-navy-900 hover:underline"><Phone className="size-3.5" />{item.context.phone}</a>
              : <span className="font-mono text-xs text-muted">{item.context.phone}</span>)}
            {item.context.wa && <a href={item.context.wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-[#25D366]/40 px-1.5 py-0.5 text-xs font-medium text-[#128C7E] hover:bg-[#25D366]/10" aria-label={`WhatsApp ${item.context.label}`}><MessageCircle className="size-3.5" /> WhatsApp</a>}
          </div>
        )}
        {(editable || canDelete) && (
          <div className="mt-3 flex items-center gap-2">
            {editable && <form action={toggleActivity}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="path" value={path} />
              <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-navy-900 px-3.5 text-xs font-medium text-white transition hover:bg-navy-800">
                <Check className="size-3.5" /> Completed
              </button>
            </form>}
            {canDelete && <form action={deleteActivity} className="ml-auto">
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="path" value={path} />
              <ConfirmButton message="Delete this activity?" title="Delete" className="rounded-md p-1.5 text-muted transition hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></ConfirmButton>
            </form>}
          </div>
        )}
      </div>
    </li>
  );
}

function HistoryRow({ item, path, editable, canDelete }: { item: TimelineItem; path: string; editable: boolean; canDelete: boolean }) {
  const Icon = ICON[item.type] ?? CircleDot;
  const when = item.doneAt ?? item.createdAt;
  if (item.type === "system") {
    return (
      <li className="relative flex min-h-10 items-center pl-14 text-xs text-muted">
        <Dot className="top-0 bg-canvas text-muted ring-0"><Icon className="size-3" /></Dot>
        <span><span className="text-ink/80">{item.subject}</span> · {item.createdBy?.name ?? "System"} · {format(when, "h:mm a")}</span>
      </li>
    );
  }
  return (
    <li className="relative pl-14">
      <Dot className="bg-navy-900 text-white"><Icon className="size-4" /></Dot>
      <div className="group rounded-xl border border-line bg-surface px-4 py-3">
        <div className="flex items-start gap-2">
          <p className={cn("flex-1 text-sm font-medium", item.type === "task" && item.doneAt && "text-muted line-through")}>{item.subject}</p>
          <span className="shrink-0 text-xs text-muted">{format(when, "h:mm a")}</span>
          {(editable || canDelete) && (
            <div className="flex shrink-0 gap-0.5 opacity-60 transition group-hover:opacity-100">
              {editable && item.dueAt && (
                <form action={toggleActivity}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="path" value={path} />
                  <button title="Mark as not done" aria-label="Mark as not done" className="rounded p-1 text-emerald-600 hover:bg-canvas"><Check className="size-3.5" /></button>
                </form>
              )}
              {canDelete && <form action={deleteActivity}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="path" value={path} />
                <ConfirmButton message="Delete this activity?" title="Delete" className="rounded p-1 text-muted hover:bg-canvas hover:text-red-600"><Trash2 className="size-3.5" /></ConfirmButton>
              </form>}
            </div>
          )}
        </div>
        {item.body && item.body !== item.subject && <p className="mt-1 whitespace-pre-line text-sm text-ink/75">{item.body}</p>}
        <p className="mt-1 text-xs text-muted">
          {item.owner?.name ?? item.createdBy?.name ?? "—"}
          {item.context && <>{" · "}<Link href={item.context.href} className="hover:underline">{item.context.label}</Link></>}
        </p>
      </div>
    </li>
  );
}
