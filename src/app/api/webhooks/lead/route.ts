import { timingSafeEqual } from "node:crypto";
import { INTAKE_KEYS, getSetting, ingestLead, type IncomingLead } from "@/lib/lead-intake";

// Website → CRM. Accepts JSON or a normal HTML form post.
//   POST /api/webhooks/lead   key via `X-Api-Key` header, `?key=`, or a `_key` field
//   Fields: name, phone, email, source, campaign, message, interest, propertyType, location, budget
//   `_redirect` (form posts): where to send the visitor afterwards. `website` is a honeypot — bots fill it.

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Api-Key" };
const hits = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) return Response.json({ ok: false, error: "Too many requests" }, { status: 429, headers: CORS });

  const isJson = req.headers.get("content-type")?.includes("application/json");
  let data: Record<string, string> = {};
  try {
    if (isJson) data = Object.fromEntries(Object.entries(await req.json()).map(([k, v]) => [k, String(v ?? "")]));
    else data = Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
  } catch {
    return Response.json({ ok: false, error: "Invalid body" }, { status: 400, headers: CORS });
  }

  const expected = await getSetting(INTAKE_KEYS.webformKey);
  const given = req.headers.get("x-api-key") ?? new URL(req.url).searchParams.get("key") ?? data._key ?? "";
  if (!expected || !safeEqual(given, expected)) return Response.json({ ok: false, error: "Invalid key" }, { status: 401, headers: CORS });

  const redirectTo = /^https?:\/\//.test(data._redirect ?? "") ? data._redirect! : null;
  const done = () => (redirectTo && !isJson ? Response.redirect(redirectTo, 303) : Response.json({ ok: true }, { headers: CORS }));
  if (data.website) return done(); // honeypot: pretend success, store nothing

  const fields: (keyof IncomingLead)[] = ["name", "phone", "email", "source", "campaign", "message", "interest", "propertyType", "location", "budget"];
  const lead: IncomingLead = Object.fromEntries(fields.map((f) => [f, data[f]]));
  const res = await ingestLead(lead, "webform");
  if (res.status === "ignored") return Response.json({ ok: false, error: "Phone or email is required" }, { status: 422, headers: CORS });
  return done();
}
