import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { unreadCount, urgentUnread } from "@/lib/notify";
import { chatUnread } from "@/lib/chat";
import { disabledFeatures } from "@/lib/features";

/** Small poll for the open app: unread counts and the newest notification, so the page can chime and update badges. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ signedOut: true }, { status: 401 });
  const [unread, urgent, chat, latest] = await Promise.all([
    unreadCount(user.id), urgentUnread(user.id),
    can(user, "chat") ? disabledFeatures().then((o) => (o.has("app-chat") ? -1 : chatUnread(user.id))) : Promise.resolve(-1),
    db.notification.findFirst({ where: { userId: user.id, readAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, priority: true } }),
  ]);
  return Response.json({ unread, urgent, chat, latest }, { headers: { "Cache-Control": "no-store" } });
}
