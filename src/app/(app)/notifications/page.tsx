import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn, fmtAgo } from "@/lib/utils";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Notifications" };

async function markAllRead() {
  "use server";
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.some((n) => !n.readAt);

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={unread && (
          <form action={markAllRead}>
            <Button variant="secondary">Mark all as read</Button>
          </form>
        )}
      />
      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <EmptyState title="You’re all caught up" description="Assignments, new leads and reminders show up here." />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id}>
                <Link href={`/notifications/open?id=${n.id}`} className={cn("flex items-start gap-3 px-4 py-3 hover:bg-canvas/60", !n.readAt && "bg-gold-100/40")}>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-gold-600")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !n.readAt && "font-medium")}>{n.title}</span>
                    {n.body && <span className="block whitespace-pre-line text-xs text-muted">{n.body}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{fmtAgo(n.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
