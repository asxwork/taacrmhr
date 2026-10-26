import { db } from "@/lib/db";
import { hashKey, ingestLead, normalizeIncoming } from "@/lib/lead-intake";

// Lead API for outside systems (Settings → Integrations → API connections). Each connection has its own key.
//   POST /api/v1/leads     Authorization: Bearer <key>  (or X-Api-Key header, or ?key=)
//   Body: one lead, an array of leads, or { "leads": [...] } (up to 100). JSON or form fields.
//   Common field names are understood: name/full_name/first_name+last_name, phone/mobile, email, message/comments,
//   source, campaign, location/area/city, property_type, budget/price, interest (buy | rent | invest | sell).
//   GET /api/v1/leads with the key checks the connection ("Test" in Zapier/Make).

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key" };
const MAX_BATCH = 100;
const hits = new Map<string, number[]>();

function rateLimited(id: string) {
  const now = Date.now();
  const recent = (hits.get(id) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(id, recent);
  return recent.length > 120;
}

async function connectionFor(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const key = (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "") || req.headers.get("x-api-key") || new URL(req.url).searchParams.get("key") || "";
  if (!key.trim()) return null;
  const conn = await db.apiConnection.findUnique({ where: { keyHash: hashKey(key.trim()) } });
  return conn?.active ? conn : null;
}

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status, headers: CORS });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const conn = await connectionFor(req);
  if (!conn) return fail(401, "Invalid or disabled API key");
  return Response.json({ ok: true, connection: conn.name }, { headers: CORS });
}

export async function POST(req: Request) {
  const conn = await connectionFor(req);
  if (!conn) return fail(401, "Invalid or disabled API key");
  if (rateLimited(conn.id)) return fail(429, "Too many requests, slow down");

  let body: unknown;
  try {
    body = req.headers.get("content-type")?.includes("application/json")
      ? await req.json()
      : Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
  } catch {
    return fail(400, "Body must be JSON or form fields");
  }
  const list = Array.isArray(body) ? body : body && typeof body === "object" && Array.isArray((body as { leads?: unknown }).leads) ? (body as { leads: unknown[] }).leads : [body];
  if (!list.length) return fail(422, "No leads in the body");
  if (list.length > MAX_BATCH) return fail(413, `Send at most ${MAX_BATCH} leads per request`);

  const source = conn.sourceId ? await db.leadSource.findUnique({ where: { id: conn.sourceId }, select: { name: true } }) : null;
  const via = { id: conn.id, name: conn.name, sourceName: source?.name ?? null, assigneeIds: (conn.assigneeIds ?? "").split(",").filter(Boolean) };
  const results = [];
  for (const item of list) {
    if (!item || typeof item !== "object") { results.push({ status: "ignored", error: "Not an object" }); continue; }
    const res = await ingestLead(normalizeIncoming(item as Record<string, unknown>), "api", via);
    results.push(res.status === "ignored" ? { status: "ignored", error: "Phone or email is required" } : res);
  }
  const accepted = results.filter((r) => r.status !== "ignored").length;
  await db.apiConnection.update({ where: { id: conn.id }, data: { lastUsedAt: new Date(), ...(accepted && { leadCount: { increment: accepted } }) } });

  const single = !Array.isArray(body) && !(body as { leads?: unknown }).leads;
  if (single) {
    const r = results[0]!;
    return Response.json({ ok: r.status !== "ignored", ...r }, { status: r.status === "ignored" ? 422 : 200, headers: CORS });
  }
  return Response.json({ ok: accepted > 0, accepted, results }, { headers: CORS });
}
