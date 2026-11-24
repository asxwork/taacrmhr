// Inbound webhook handler shared by /api/rest/<key>/<method> and /api/rest/<method> (key in a header).
import { ApiError, authorize, callMethod, hashToken, methodList } from "./dev-api";

export const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key" };
const STATUS: Record<string, number> = { NO_AUTH: 401, ACCESS_DENIED: 403, METHOD_NOT_FOUND: 404, NOT_FOUND: 404, INVALID: 400 };
const hits = new Map<string, number[]>();

/** Shared by both ways in: the key in the URL (/api/rest/<key>/<method>) or in a header (/api/rest/<method>). */
export async function handleRest(req: Request, token: string, method: string) {
  const t0 = Date.now();
  // At most 2 calls a second per key on average (120 a minute), like Bitrix.
  // Counted per key fingerprint (the key itself is never kept or logged).
  const id = hashToken(token || "-");
  const now = Date.now(), recent = (hits.get(id) ?? []).filter((t) => now - t < 60_000);
  recent.push(now); hits.set(id, recent);
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
    const name = method.replace(/\.json$/, "");
    // "methods": the published list of what this key can call, with every parameter.
    if (name === "methods") {
      const { scopes } = await authorize(token, null, "rest");
      return Response.json({ result: methodList(scopes), time: { start: t0 / 1000, finish: Date.now() / 1000, duration: (Date.now() - t0) / 1000 } }, { headers: CORS });
    }
    const out = (await callMethod(name, token, p)) as Record<string, unknown>;
    return Response.json({ ...out, time: { start: t0 / 1000, finish: Date.now() / 1000, duration: (Date.now() - t0) / 1000 } }, { headers: CORS });
  } catch (e) {
    if (e instanceof ApiError) return Response.json({ error: e.code, error_description: e.message }, { status: STATUS[e.code] ?? 400, headers: CORS });
    console.error("API error", e);
    return Response.json({ error: "INTERNAL_SERVER_ERROR", error_description: "Something went wrong in AMS." }, { status: 500, headers: CORS });
  }
}

