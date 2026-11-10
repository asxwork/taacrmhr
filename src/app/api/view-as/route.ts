import { redirectTo } from "@/lib/redirect";
import { cookies } from "next/headers";
import { getCurrentUser, VIEW_AS_COOKIE } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * Super Admin "View as": /api/view-as?user=<id> starts (read-only, 2 hours max), /api/view-as?exit=1 ends.
 * While it's on, middleware refuses every change, so nothing can be saved in someone else's name.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  if (url.searchParams.has("exit")) {
    jar.delete(VIEW_AS_COOKIE);
    return redirectTo("/settings/users");
  }
  const me = await getCurrentUser();
  const real = me?.viewAs ? await db.user.findUnique({ where: { id: me.viewAs.realId } }) : me;
  if (!real?.isSuperAdmin) return new Response("Not found", { status: 404 });
  const target = await db.user.findUnique({ where: { id: url.searchParams.get("user") ?? "" } });
  if (!target || !target.active || target.id === real.id) return redirectTo("/settings/users");
  jar.set(VIEW_AS_COOKIE, target.id, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/", maxAge: 2 * 3600 });
  await audit(real.id, "view_as", "user", target.id, `Started viewing the app as ${target.name}`);
  return redirectTo("/profile");
}
