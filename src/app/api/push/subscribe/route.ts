import { createHash } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { vapidKeys } from "@/lib/push";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

/** GET: the public key for subscribing. POST: save this device. DELETE: forget this device. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const keys = await vapidKeys();
  return keys ? Response.json({ publicKey: keys.publicKey }) : new Response("Push isn't set up (needs SIP_SECRET_KEY or CRON_SECRET).", { status: 503 });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.viewAs) return new Response("Unauthorized", { status: 401 });
  const sub = (await req.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys.auth || sub.endpoint.length > 2000) return new Response("Bad subscription", { status: 400 });
  const data = { userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh.slice(0, 190), auth: sub.keys.auth.slice(0, 190), userAgent: req.headers.get("user-agent")?.slice(0, 190) ?? null };
  await db.pushSubscription.upsert({ where: { key: hash(sub.endpoint) }, update: data, create: { key: hash(sub.endpoint), ...data } });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) await db.pushSubscription.deleteMany({ where: { key: hash(endpoint), userId: user.id } });
  return Response.json({ ok: true });
}
