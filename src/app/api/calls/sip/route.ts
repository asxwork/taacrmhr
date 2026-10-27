import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { sipConfigFor } from "@/lib/softphone";

/** The signed-in agent's own extension details for the browser softphone (never anyone else's). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user, "calls")) return new Response("Unauthorized", { status: 401 });
  const cfg = await sipConfigFor(user.id);
  return Response.json(cfg ? { ok: true, ...cfg, name: user.name } : { ok: false }, { headers: { "Cache-Control": "private, no-store" } });
}
