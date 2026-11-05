import { getCurrentUser } from "@/lib/auth";
import { logError } from "@/lib/errors";

/** Browser errors reported by the error screens (signed-in users only, small bodies only). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 204 });
  const b = (await req.json().catch(() => ({}))) as { message?: string; stack?: string; path?: string };
  if (b.message) await logError({ source: "browser", message: String(b.message).slice(0, 1000), stack: b.stack ? String(b.stack).slice(0, 4000) : null, path: b.path ? String(b.path) : null, userId: user.id });
  return new Response(null, { status: 204 });
}
