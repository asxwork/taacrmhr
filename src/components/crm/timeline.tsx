import Link from "next/link";
import { isPast } from "date-fns";
import { CalendarCheck, Check, CircleDot, MapPin, MessageSquare, Phone, StickyNote, Trash2, Users } from "lucide-react";
import { cn, fmtAgo, fmtDateTime } from "@/lib/utils";
import { deleteActivity, toggleActivity } from "@/app/(app)/crm/activity-actions";

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
  context?: { label: string; href: string } | null;
};

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  note: StickyNote, call: Phone, meeting: Users, visit: MapPin, task: CalendarCheck, email: MessageSquare, system: CircleDot,
};

/** Activity feed for a record: open (scheduled) items first, then history newest-first. */
export function Timeline({ items, path, editableIds }: { items: TimelineItem[]; path: string; editableIds: Set<string> }) {
  const open = items.filter((i) => i.dueAt && !i.doneAt).sort((a, b) => +a.dueAt! - +b.dueAt!);
  const history = items.filter((i) => !(i.dueAt && !i.doneAt)).sort((a, b) => +(b.doneAt ?? b.createdAt) - +(a.doneAt ?? a.createdAt));

  return (
    <div className="space-y-6">
      {open.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Planned</p>
          <ul className="space-y-2">
            {open.map((i) => (
              <Row key={i.id} item={i} path={path} editable={editableIds.has(i.id)} />
            ))}
          </ul>
        </section>
      )}
      <section>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">History</p>
        {history.length === 0 ? (
          <p className="text-sm text-muted">No activity yet.</p>
        ) : (
          <ul className="relative space-y-4 before:absolute before:inset-y-2 before:left-[15px] before:w-px before:bg-line">
            {history.map((i) => (
              <Row key={i.id} item={i} path={path} editable={editableIds.has(i.id)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ item, path, editable }: { item: TimelineItem; path: string; editable: boolean }) {
  const Icon = ICON[item.type] ?? CircleDot;
  const planned = item.dueAt && !item.doneAt;
  const overdue = planned && isPast(item.dueAt!);

  if (item.type === "system") {
    return (
      <li className="relative flex items-center gap-3 pl-0 text-xs text-muted">
        <span className="z-10 flex size-8 items-center justify-center rounded-full bg-canvas"><Icon className="size-3" /></span>
        <span>{item.subject}</span>
        <span>· {item.createdBy?.name ?? "System"} · {fmtAgo(item.createdAt)}</span>
      </li>
    );
  }

  return (
    <li className={cn("relative flex gap-3", planned && "rounded-lg border p-3", planned && (overdue ? "border-red-200 bg-red-50/40" : "border-line bg-surface"))}>
      <span className={cn("z-10 flex size-8 shrink-0 items-center justify-center rounded-full", planned ? "bg-gold-100 text-gold-700" : "bg-navy-900/5 text-navy-900")}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={cn("flex-1 text-sm font-medium", item.type === "task" && item.doneAt && "text-muted line-through")}>{item.subject}</p>
          {editable && (
            <div className="flex shrink-0 gap-0.5">
              {item.dueAt && (
                <form action={toggleActivity}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="path" value={path} />
                  <button title={item.doneAt ? "Mark as not done" : "Mark done"} className={cn("rounded p-1 hover:bg-canvas", item.doneAt ? "text-emerald-600" : "text-muted")}>
                    <Check className="size-3.5" />
                  </button>
                </form>
              )}
              <form action={deleteActivity}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="path" value={path} />
                <button title="Delete" className="rounded p-1 text-muted hover:bg-canvas hover:text-red-600">
                  <Trash2 className="size-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>
        {item.body && item.body !== item.subject && <p className="mt-0.5 whitespace-pre-line text-sm text-ink/75">{item.body}</p>}
        <p className="mt-1 text-xs text-muted">
          {planned ? (
            <span className={overdue ? "font-medium text-red-600" : ""}>{overdue ? "Overdue · " : "Due "}{fmtDateTime(item.dueAt)}</span>
          ) : (
            fmtAgo(item.doneAt ?? item.createdAt)
          )}
          {" · "}
          {item.owner?.name ?? item.createdBy?.name ?? "—"}
          {item.context && (
            <>
              {" · "}
              <Link href={item.context.href} className="hover:underline">{item.context.label}</Link>
            </>
          )}
        </p>
      </div>
    </li>
  );
}
