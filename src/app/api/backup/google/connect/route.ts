import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { redirectTo } from "@/lib/redirect";
import { getCurrentUser } from "@/lib/auth";
import { backupConfig, googleAuthUrl } from "@/lib/backup";

/** Super Admin only: sends them to Google to allow AMS to save backups in their Drive. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin || user.viewAs) return new Response("Forbidden", { status: 403 });
  const c = await backupConfig();
  if (!c.clientId || !c.clientSecret) return redirectTo("/settings/backup?err=Save+the+Google+client+ID+and+secret+first");
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(googleAuthUrl(c.clientId, state));
  res.cookies.set("taa_gstate", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
