// Calls app (CSR calling centre): campaigns of numbers split into per-agent batches, an agent queue, call
// outcomes with retries and callbacks, do-not-call, and turning interested callers into CRM leads.
// The PBX (softphone, recordings) plugs in later through CallLog.pbxCallId / recordingPath.
import { addHours } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { phoneKey } from "./crm-shared";
import { ingestLead } from "./lead-intake";

export const OUTCOMES = [
  { value: "interested", label: "Interested", tone: "green", reached: true, final: true },
  { value: "callback", label: "Call back", tone: "blue", reached: true, final: false },
  { value: "not_interested", label: "Not interested", tone: "slate", reached: true, final: true },
  { value: "not_answered", label: "Not answered", tone: "amber", reached: false, final: false },
  { value: "busy", label: "Busy", tone: "amber", reached: false, final: false },
  { value: "switched_off", label: "Switched off", tone: "amber", reached: false, final: false },
  { value: "wrong_number", label: "Wrong number", tone: "red", reached: false, final: true },
  { value: "already_customer", label: "Already a client", tone: "violet", reached: true, final: true },
  { value: "do_not_call", label: "Do not call", tone: "red", reached: true, final: true },
  { value: "whatsapp_sent", label: "WhatsApp sent", tone: "teal", reached: false, final: false },
] as const;
export type Outcome = (typeof OUTCOMES)[number]["value"];
export const outcome = (v: string | null | undefined) => OUTCOMES.find((o) => o.value === v);

/** Hours before an unanswered number comes back to the agent. */
export const RETRY_AFTER_HOURS = 3;

/** The agent's queue in calling order: due callbacks, new numbers, then retries whose wait is over. */
export function queueWhere(agentId: string, now = new Date()): Prisma.CallTargetWhereInput {
  return {
    assigneeId: agentId, campaign: { status: "active" },
    OR: [
      { status: "callback", callbackAt: { lte: now } },
      { status: "new" },
      { status: "retry", OR: [{ lastCalledAt: null }, { lastCalledAt: { lte: addHours(now, -RETRY_AFTER_HOURS) } }] },
    ],
  };
}

export async function nextTarget(agentId: string) {
  const where = queueWhere(agentId);
  // Callbacks first, then new numbers in upload order, then retries (oldest attempt first).
  for (const status of ["callback", "new", "retry"]) {
    const t = await db.callTarget.findFirst({
      where: { AND: [where, { status }] }, include: { campaign: true, logs: { orderBy: { startedAt: "desc" }, take: 5 } },
      orderBy: status === "callback" ? { callbackAt: "asc" } : status === "new" ? { createdAt: "asc" } : { lastCalledAt: "asc" },
    });
    if (t) return t;
  }
  return null;
}

/** Saves a call (or WhatsApp) result and moves the number on: done, retry later, callback, or do-not-call. */
export async function recordOutcome(input: { targetId: string; agentId: string; outcome: Outcome; notes?: string | null; callbackAt?: Date | null; durationSec?: number | null; channel?: string }) {
  const t = await db.callTarget.findUnique({ where: { id: input.targetId }, include: { campaign: true } });
  if (!t) return { error: "Number not found." };
  const o = outcome(input.outcome);
  if (!o) return { error: "Choose an outcome." };
  if (input.outcome === "callback" && !input.callbackAt) return { error: "When should we call back?" };
  const attempts = input.outcome === "whatsapp_sent" ? t.attempts : t.attempts + 1;
  const status = input.outcome === "do_not_call" ? "dnc"
    : input.outcome === "callback" ? "callback"
    : o.final ? "done"
    : attempts >= t.campaign.maxAttempts && input.outcome !== "whatsapp_sent" ? "done" : t.status === "new" && input.outcome === "whatsapp_sent" ? "new" : "retry";
  await db.callLog.create({
    data: { targetId: t.id, campaignId: t.campaignId, agentId: input.agentId, phone: t.phone, outcome: input.outcome, notes: input.notes ?? null, durationSec: input.durationSec ?? null, channel: input.channel ?? (input.outcome === "whatsapp_sent" ? "whatsapp" : "phone") },
  });
  await db.callTarget.update({
    where: { id: t.id },
    data: {
      status, outcome: input.outcome, attempts, lastCalledAt: new Date(), callbackAt: input.outcome === "callback" ? input.callbackAt : null,
      notes: input.notes ? [t.notes, input.notes].filter(Boolean).join("\n") : t.notes,
    },
  });
  if (input.outcome === "do_not_call") await db.dncNumber.upsert({ where: { phoneKey: t.phoneKey }, update: {}, create: { phoneKey: t.phoneKey, reason: `Asked not to be called (${t.campaign.name})` } });
  return { ok: true as const, status };
}

/** Sends the number to the CRM (duplicate check and lead rotation as for any incoming lead). */
export async function convertToLead(targetId: string, agentName: string) {
  const t = await db.callTarget.findUnique({ where: { id: targetId }, include: { campaign: true } });
  if (!t) return { error: "Number not found." };
  if (t.leadId) return { ok: true as const, leadId: t.leadId };
  const res = await ingestLead(
    { name: t.name ?? undefined, phone: t.phone, source: t.campaign.sourceName ?? undefined, campaign: t.campaign.name, message: [`From the calling team (${agentName})`, t.notes].filter(Boolean).join("\n") },
    "api",
    { id: `calls-${t.campaignId}`, name: `Calls: ${t.campaign.name}`, sourceName: t.campaign.sourceName ?? "CC" },
  );
  if (res.status === "ignored") return { error: "This number couldn't be turned into a lead." };
  await db.callTarget.update({ where: { id: t.id }, data: { leadId: res.leadId } });
  return { ok: true as const, leadId: res.leadId, merged: res.status === "merged" };
}

/**
 * Parses pasted or uploaded numbers: one per line, "phone" or "name, phone" or a CSV with a header row containing
 * a phone/mobile column (other columns are kept as extra info shown to the agent).
 */
export function parseNumbers(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const cells = (l: string) => l.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
  const head = cells(lines[0]!).map((h) => h.toLowerCase());
  const phoneCol = head.findIndex((h) => /phone|mobile|number|cell|contact/.test(h));
  const nameCol = head.findIndex((h) => /name/.test(h));
  const hasHeader = phoneCol >= 0 && !/\d{7,}/.test(lines[0]!);
  const rows = (hasHeader ? lines.slice(1) : lines).map((l) => {
    const c = cells(l);
    if (hasHeader) {
      const extra = Object.fromEntries(head.map((h, i) => [h, c[i] ?? ""]).filter(([h, v], i) => v && i !== phoneCol && i !== nameCol && h));
      return { phone: c[phoneCol] ?? "", name: nameCol >= 0 ? c[nameCol] || null : null, extra: Object.keys(extra).length ? extra : null };
    }
    const phone = c.find((x) => /\d{7,}/.test(x.replace(/\D/g, ""))) ?? "";
    const name = c.find((x) => x && x !== phone && !/\d{5,}/.test(x)) ?? null;
    return { phone, name, extra: null as Record<string, string> | null };
  });
  return rows.filter((r) => phoneKey(r.phone));
}

/** Adds numbers to a campaign, skipping duplicates within the campaign and the do-not-call list. */
export async function importNumbers(campaignId: string, rows: ReturnType<typeof parseNumbers>) {
  const keys = rows.map((r) => phoneKey(r.phone)!);
  const [existing, dnc] = await Promise.all([
    db.callTarget.findMany({ where: { campaignId, phoneKey: { in: keys } }, select: { phoneKey: true } }),
    db.dncNumber.findMany({ where: { phoneKey: { in: keys } }, select: { phoneKey: true } }),
  ]);
  const skip = new Set([...existing.map((e) => e.phoneKey), ...dnc.map((d) => d.phoneKey)]);
  const seen = new Set<string>();
  const data = rows.flatMap((r) => {
    const key = phoneKey(r.phone)!;
    if (skip.has(key) || seen.has(key)) return [];
    seen.add(key);
    return [{ campaignId, phone: r.phone, phoneKey: key, name: r.name, extra: r.extra ? JSON.stringify(r.extra) : null }];
  });
  for (let i = 0; i < data.length; i += 500) await db.callTarget.createMany({ data: data.slice(i, i + 500) });
  return { added: data.length, duplicates: rows.length - data.length - dnc.filter((d) => keys.includes(d.phoneKey)).length, dnc: dnc.length };
}

/** Splits unassigned numbers into batches of `size`, dealt round-robin to the chosen agents. */
export async function makeBatches(campaignId: string, agentIds: string[], size: number) {
  const free = await db.callTarget.findMany({ where: { campaignId, assigneeId: null, status: { in: ["new", "retry"] } }, select: { id: true }, orderBy: { createdAt: "asc" } });
  if (!free.length || !agentIds.length) return { batches: 0, numbers: 0 };
  const agents = await db.user.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } });
  const count = await db.callBatch.count({ where: { campaignId } });
  let made = 0;
  for (let i = 0, a = 0; i < free.length; i += size, a++) {
    const agent = agents[a % agents.length]!;
    const batch = await db.callBatch.create({ data: { campaignId, name: `Batch ${count + made + 1} · ${agent.name}`, assigneeId: agent.id } });
    await db.callTarget.updateMany({ where: { id: { in: free.slice(i, i + size).map((t) => t.id) } }, data: { batchId: batch.id, assigneeId: agent.id } });
    made++;
  }
  return { batches: made, numbers: free.length };
}

/** People who can be given numbers: anyone whose roles allow working calls (Super Admins too, if asked). */
export async function callAgents(withSuperAdmins = true) {
  return db.user.findMany({
    where: { active: true, OR: [...(withSuperAdmins ? [{ isSuperAdmin: true }] : []), { roles: { some: { role: { permissions: { some: { module: "calls", action: "edit" } } } } } }] },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
}
