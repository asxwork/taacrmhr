// Outbound webhooks (Settings → Developer resources): when a lead, activity or deal is added or changed, AMS posts
// { event, ts, data } to every active outbound webhook that wants that event. Signed so the receiver can check it came
// from AMS: header X-AMS-Signature: sha256=<HMAC-SHA256 of the raw body with the webhook's secret>.
// Fired from the database layer (lib/db.ts) in the background; a slow or broken receiver never slows AMS down.
import { createHmac } from "node:crypto";
import { db } from "./db";
import { memo } from "./memo";
import { openSecret } from "./softphone";

type Hook = { id: string; url: string; events: string[]; secret: string | null };
const outbound = () => memo("devhook:outbound", 60_000, async (): Promise<Hook[]> =>
  (await db.devHook.findMany({ where: { kind: "outbound", active: true } })).map((h) => ({ id: h.id, url: h.url ?? "", events: (h.events ?? "").split(",").filter(Boolean), secret: openSecret(h.secretSealed) })).filter((h) => h.url));

/** Lead changes worth telling others about (not the internal last-activity stamps). */
const LEAD_FIELDS = ["statusId", "ownerId", "name", "phone", "email", "notes", "projectId", "projectName", "sourceId"];

export function queueDevEvent(model: string, operation: string, args: { data?: Record<string, unknown> } | undefined, result: unknown) {
  const kind = operation === "create" ? "created" : operation === "update" || operation === "upsert" ? "updated" : null;
  if (!kind || !result || typeof result !== "object" || !("id" in result)) return;
  if (model === "Lead" && kind === "updated" && !Object.keys(args?.data ?? {}).some((k) => LEAD_FIELDS.includes(k))) return;
  const event = `${model.toLowerCase()}.${kind}`;
  if (!["lead.created", "lead.updated", "activity.created", "deal.created", "deal.updated"].includes(event)) return;
  setTimeout(() => { void deliver(event, (result as { id: string }).id).catch(() => {}); }, 50);
}

async function payload(event: string, id: string) {
  if (event.startsWith("lead.")) {
    const l = await db.lead.findUnique({ where: { id }, select: { id: true, number: true, name: true, phone: true, email: true, status: { select: { name: true } }, owner: { select: { name: true, email: true } }, source: { select: { name: true } }, updatedAt: true } });
    return l && { id: l.id, number: l.number, name: l.name, phone: l.phone, email: l.email, stage: l.status.name, source: l.source?.name ?? null, responsible: l.owner ? { name: l.owner.name, email: l.owner.email } : null, updated_at: l.updatedAt };
  }
  if (event.startsWith("activity.")) {
    const a = await db.activity.findUnique({ where: { id }, select: { id: true, type: true, subject: true, body: true, dueAt: true, doneAt: true, lead: { select: { id: true, number: true, name: true } } } });
    return a && { id: a.id, type: a.type, subject: a.subject, body: a.body, due_at: a.dueAt, done_at: a.doneAt, lead: a.lead };
  }
  const d = await db.deal.findUnique({ where: { id }, select: { id: true, title: true, value: true, stage: { select: { name: true } }, owner: { select: { name: true } } } });
  return d && { id: d.id, title: d.title, value: d.value, stage: d.stage.name, responsible: d.owner?.name ?? null };
}

export async function sendToHook(h: { id: string; url: string; secret: string | null }, event: string, data: unknown) {
  const body = JSON.stringify({ event, ts: new Date().toISOString(), data });
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "AMS-Webhooks/1.0", "x-ams-event": event };
  if (h.secret) headers["x-ams-signature"] = `sha256=${createHmac("sha256", h.secret).update(body).digest("hex")}`;
  let status = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(h.url, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
      status = `${r.status}`;
      if (r.ok) break;
    } catch (e) { status = e instanceof Error ? e.message.slice(0, 80) : "failed"; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  await db.devHook.update({ where: { id: h.id }, data: { calls: { increment: 1 }, lastUsedAt: new Date(), lastStatus: `${event} → ${status}` } }).catch(() => {});
  return status;
}

async function deliver(event: string, id: string) {
  const hooks = (await outbound()).filter((h) => h.events.includes(event));
  if (!hooks.length) return;
  const data = await payload(event, id);
  if (!data) return;
  await Promise.all(hooks.map((h) => sendToHook(h, event, data)));
}
