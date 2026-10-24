import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Marks one of the user's notifications read and follows its link (app paths only). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", url));
  const n = await db.notification.findFirst({ where: { id: url.searchParams.get("id") ?? "", userId: user.id } });
  if (!n) return NextResponse.redirect(new URL("/notifications", url));
  if (!n.readAt) await db.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  const target = n.link?.startsWith("/") && !n.link.startsWith("//") ? n.link : "/notifications";
  return NextResponse.redirect(new URL(target, url));
}
