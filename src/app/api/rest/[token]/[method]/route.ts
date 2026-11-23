import { ApiError, callMethod } from "@/lib/dev-api";

// Inbound webhook (Settings → Developer resources), Bitrix style:
//   GET or POST https://<domain>/api/rest/<key>/crm.lead.list?stage=New%20Request
//   POST body: JSON or form fields. ".json" after the method name is allowed (crm.lead.list.json).
// Answer: { result, total?, next?, time } or { error, error_description } with an HTTP error status.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const STATUS: Record<string, number> = { NO_AUTH: 401, ACCESS_DENIED: 403, METHOD_NOT_FOUND: 404, NOT_FOUND: 404, INVALID: 400 };
const hits = new Map<string, number[]>();

async function handle(req: Request, params: Promise<{ token: string; method: string }>) {
  const t0 = Date.now();
  const { token, method } = await params;
  // At most 2 calls a second per key on average (120 a minute), like Bitrix.
  const now = Date.now(), recent = (hits.get(token) ?? []).filter((t) => now - t < 60_000);
  recent.push(now); hits.set(token, recent);
  if (recent.length > 120) return Response.json({ error: "QUERY_LIMIT_EXCEEDED", error_description: "Too many requests: at most 120 a minute per key." }, { status: 429, headers: CORS });
  const p: Record<string, unknown> = Object.fromEntries(new URL(req.url).searchParams);
  if (req.method === "POST") {
    const type = req.headers.get("content-type") ?? "";
    try {
      if (type.includes("json")) Object.assign(p, await req.json());
      else if (type.includes("form")) for (const [k, v] of (await req.formData()).entries()) if (typeof v === "string") p[k] = v;
    } catch { return Response.json({ error: "INVALID", error_description: "The body isn't valid JSON or form data." }, { status: 400, headers: CORS }); }
  }
  try {
    const out = (await callMethod(method.replace(/\.json$/, ""), token, p)) as Record<string, unknown>;
    return Response.json({ ...out, time: { start: t0 / 1000, finish: Date.now() / 1000, duration: (Date.now() - t0) / 1000 } }, { headers: CORS });
  } catch (e) {
    if (e instanceof ApiError) return Response.json({ error: e.code, error_description: e.message }, { status: STATUS[e.code] ?? 400, headers: CORS });
    console.error("API error", e);
    return Response.json({ error: "INTERNAL_SERVER_ERROR", error_description: "Something went wrong in AMS." }, { status: 500, headers: CORS });
  }
}

export const GET = (req: Request, ctx: { params: Promise<{ token: string; method: string }> }) => handle(req, ctx.params);
export const POST = GET;
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
