import { PushToggle } from "@/components/push-toggle";
import Link from "@/components/link";
import { revalidatePath } from "next/cache";
import { AlertTriangle, Bell, Briefcase, Clock, Settings2, Target, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NOTIFY_CATEGORIES } from "@/lib/notify";
import { cn, fmtAgo } from "@/lib/utils";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Notifications" };

const CAT_ICON = { crm: Target, hr: Briefcase, finance: Wallet, system: Settings2 } as const;
const CAT_TONE = { crm: "bg-sky-100 text-sky-700", hr: "bg-violet-100 text-violet-700", finance: "bg-emerald-100 text-emerald-700", system: "bg-slate-100 text-slate-600" } as const;

async function markAllRead(fd: FormData) {
  "use server";
  const user = await requireUser();
  const tab = String(fd.get("tab") ?? "");
  await db.notification.updateMany({ where: { userId: user.id, readAt: null, ...(tab === "urgent" ? { priority: "urgent" } : tab ? { category: tab } : {}) }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

/** Notifications by app (CRM, HR, Finance, System) with Urgent first. */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const tab = (await searchParams).tab ?? "";
  const filter = tab === "urgent" ? { priority: "urgent" } : NOTIFY_CATEGORIES.some(([k]) => k === tab) ? { category: tab } : {};
  const [items, unreadBy, urgentUnread] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id, ...filter }, orderBy: { createdAt: "desc" }, take: 150 }),
    db.notification.groupBy({ by: ["category"], where: { userId: user.id, readAt: null }, _count: true }),
    db.notification.count({ where: { userId: user.id, readAt: null, priority: "urgent" } }),
  ]);
  // Unread urgent ones first, then everything newest first.
  const sorted = [...items.filter((n) => !n.readAt && n.priority === "urgent"), ...items.filter((n) => n.readAt || n.priority !== "urgent")];
  const unread = items.some((n) => !n.readAt);
  const count = (k: string) => unreadBy.find((u) => u.category === k)?._count ?? 0;
  const total = unreadBy.reduce((s, u) => s + u._count, 0);
  const tabs: [string, string, number, boolean?][] = [["", "All", total], ["urgent", "Urgent", urgentUnread, true], ...NOTIFY_CATEGORIES.map(([k, l]) => [k, l, count(k)] as [string, string, number])];

  return (
    <>
      <PageHeader title="Notifications" description="Urgent ones (overdue, over budget, low cash, failures, security) come first. Filter by app."
        actions={unread && (
          <form action={markAllRead}>
            <input type="hidden" name="tab" value={tab} />
            <Button variant="secondary">Mark {tab ? "these" : "all"} as read</Button>
          </form>
        )}
      />
      <div className="mb-4"><PushToggle /></div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map(([k, l, n, red]) => (
          <Link key={k} href={k ? `/notifications?tab=${k}` : "/notifications"} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm", tab === k ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface hover:bg-canvas")}>
            {red ? <AlertTriangle className={cn("size-3.5", tab === k ? "text-white" : "text-red-600")} />
              : (() => { const Icon = k in CAT_ICON ? CAT_ICON[k as keyof typeof CAT_ICON] : Bell; return <Icon className={cn("size-3.5", tab === k ? "text-white" : "text-muted")} />; })()}{l}
            {n > 0 && <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", red ? "bg-red-600 text-white" : tab === k ? "bg-white/20" : "bg-canvas text-muted")}>{n}</span>}
          </Link>
        ))}
      </div>
      <Card className="overflow-hidden">
        {sorted.length === 0 ? (
          <EmptyState title="You’re all caught up" description={tab ? "Nothing here." : "Assignments, new leads and reminders show up here."} />
        ) : (
          <ul className="divide-y divide-line">
            {sorted.map((n) => {
              const cat = (n.category in CAT_ICON ? n.category : "system") as keyof typeof CAT_ICON;
              const Icon = CAT_ICON[cat];
              const urgent = n.priority === "urgent";
              return (
                <li key={n.id}>
                  <Link href={`/notifications/open?id=${n.id}`} className={cn("flex items-start gap-3 border-l-4 px-4 py-3 hover:bg-canvas/60", urgent && !n.readAt ? "border-l-red-500 bg-red-50/60" : !n.readAt ? "border-l-gold-400 bg-gold-100/30" : "border-l-transparent")}>
                    <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", CAT_TONE[cat])}><Icon className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {urgent && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Urgent</span>}
                        {n.priority === "high" && <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800"><Clock className="size-3" /> Action</span>}
                        <span className={cn("text-sm", !n.readAt && "font-medium")}>{n.title}</span>
                      </span>
                      {n.body && <span className="block whitespace-pre-line text-xs text-muted">{n.body}</span>}
                    </span>
                    <span className="shrink-0 text-right text-xs text-muted">{fmtAgo(n.createdAt)}<span className="block text-[10px] uppercase tracking-wide">{NOTIFY_CATEGORIES.find(([k]) => k === cat)?.[1]}</span></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
