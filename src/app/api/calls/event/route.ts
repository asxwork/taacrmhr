import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { linkRecording } from "@/lib/softphone";

/**
 * A softphone call ended. Calls placed from the dialer card are logged by the agent's outcome; anything else
 * (keypad calls, inbound calls, missed calls) is logged here automatically.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "calls")) return new Response("Unauthorized", { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { direction?: string; phone?: string; talkSec?: number; callId?: string; answered?: boolean; fromDialer?: boolean; startedAt?: number };
  const phone = String(b.phone ?? "").replace(/[^\d+*#]/g, "").slice(0, 30);
  if (!phone || b.fromDialer) return Response.json({ ok: true });
  const direction = b.direction === "in" ? "in" : "out";
  const callId = String(b.callId ?? "").slice(0, 200) || null;
  if (callId && (await db.callLog.findFirst({ where: { pbxCallId: callId, agentId: user.id } }))) return Response.json({ ok: true });
  const started = Number(b.startedAt);
  await db.callLog.create({
    data: {
      agentId: user.id, phone, direction, channel: "phone", pbxCallId: callId,
      outcome: direction === "in" ? (b.answered ? "inbound_answered" : "inbound_missed") : b.answered ? "manual_call" : "not_answered",
      durationSec: Math.max(0, Math.min(14_400, Math.round(Number(b.talkSec) || 0))),
      startedAt: started > 0 && Math.abs(Date.now() - started) < 86_400_000 ? new Date(started) : new Date(),
    },
  });
  if (callId) await linkRecording(callId, user.id);
  return Response.json({ ok: true });
}
