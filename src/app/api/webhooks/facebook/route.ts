import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { INTAKE_KEYS, getSetting, ingestLead } from "@/lib/lead-intake";

// Facebook / Instagram Lead Ads → CRM.
// Setup (Meta App → Webhooks → Page → subscribe to `leadgen`):
//   Callback URL: https://<your-domain>/api/webhooks/facebook
//   Verify token: shown in Settings → Integrations
// Env: FB_APP_SECRET (signs each delivery), FB_PAGE_TOKEN (page access token with leads_retrieval)

const GRAPH = "https://graph.facebook.com/v21.0";

/** Meta's subscription handshake. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const token = await getSetting(INTAKE_KEYS.facebookVerify);
  if (p.get("hub.mode") === "subscribe" && token && p.get("hub.verify_token") === token) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

type LeadgenChange = { field: string; value: { leadgen_id?: string; form_id?: string; ad_id?: string; page_id?: string } };

export async function POST(req: Request) {
  const secret = process.env.FB_APP_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });

  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return new Response("Bad signature", { status: 401 });
  }

  let body: { object?: string; entry?: { changes?: LeadgenChange[] }[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const leadIds = (body.entry ?? []).flatMap((e) => e.changes ?? []).filter((c) => c.field === "leadgen" && c.value.leadgen_id).map((c) => c.value.leadgen_id!);
  for (const id of leadIds) await importFacebookLead(id);
  return new Response("OK", { status: 200 });
}

async function importFacebookLead(leadgenId: string) {
  const token = process.env.FB_PAGE_TOKEN;
  if (!token) {
    await db.webhookLog.create({ data: { source: "facebook", status: "error", summary: `Lead ${leadgenId}: FB_PAGE_TOKEN not set` } });
    return;
  }
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(leadgenId)}?fields=field_data,campaign_name,ad_name,form_id,platform&access_token=${encodeURIComponent(token)}`);
    const json = (await res.json()) as {
      field_data?: { name: string; values: string[] }[]; campaign_name?: string; ad_name?: string; platform?: string; error?: { message: string };
    };
    if (!res.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${res.status}`);

    const f = Object.fromEntries((json.field_data ?? []).map((d) => [d.name.toLowerCase(), d.values?.[0] ?? ""]));
    const known = new Set(["full_name", "first_name", "last_name", "phone_number", "email"]);
    const extra = Object.entries(f).filter(([k]) => !known.has(k)).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join("\n");
    await ingestLead(
      {
        name: f.full_name || [f.first_name, f.last_name].filter(Boolean).join(" "),
        phone: f.phone_number,
        email: f.email,
        source: json.platform === "ig" ? "Instagram" : "Facebook",
        campaign: json.campaign_name ?? json.ad_name,
        message: extra || undefined,
      },
      "facebook",
    );
  } catch (e) {
    await db.webhookLog.create({ data: { source: "facebook", status: "error", summary: `Lead ${leadgenId}: ${e instanceof Error ? e.message : "fetch failed"}`.slice(0, 500) } });
  }
}
