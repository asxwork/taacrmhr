import { redirectTo } from "@/lib/redirect";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Marks one of the user's notifications read and follows its link (app paths only). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getCurrentUser();
  if (!user) return redirectTo("/login");
  const n = await db.notification.findFirst({ where: { id: url.searchParams.get("id") ?? "", userId: user.id } });
  if (!n) return redirectTo("/notifications");
  if (!n.readAt) await db.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  const target = n.link?.startsWith("/") && !n.link.startsWith("//") ? n.link : "/notifications";
  return redirectTo(target);
}
