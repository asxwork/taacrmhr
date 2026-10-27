import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

const STATES = new Set(["offline", "ready", "ringing", "talking"]);

/** Softphone heartbeat: the agent's live state for the wallboard. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { state?: string; peer?: string };
  const state = STATES.has(body.state ?? "") ? body.state! : "offline";
  await db.sipAccount.updateMany({ where: { userId: user.id }, data: { presence: state, presencePeer: state === "talking" || state === "ringing" ? String(body.peer ?? "").slice(0, 40) : null, presenceAt: new Date() } });
  return Response.json({ ok: true });
}
