import { getCurrentUser } from "@/lib/auth";
import { visibleTutorials } from "@/lib/tutorial-access";

// Written steps for the ? help, loaded only when someone opens them (keeps every page lighter).
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const keys = (new URL(req.url).searchParams.get("keys") ?? "").split(",").filter(Boolean).slice(0, 10);
  const items = visibleTutorials(user).filter((t) => keys.includes(t.key)).map((t) => ({ key: t.key, steps: t.steps, tips: t.tips ?? [] }));
  return Response.json(items, { headers: { "Cache-Control": "private, max-age=3600" } });
}
