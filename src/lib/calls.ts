// Calls app (CSR calling centre): campaigns of numbers split into per-agent batches, an agent queue, call
// outcomes with retries and callbacks, do-not-call, and turning interested callers into CRM leads.
// The softphone (lib/softphone.ts) links calls to the PBX through CallLog.pbxCallId and recordings.
import { addHours } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { phoneKey } from "./crm-shared";
import { ingestLead } from "./lead-intake";
import type { SessionUser } from "./auth";
import { scopeFor } from "./permissions";

export const OUTCOMES = [
  { value: "interested", label: "Interested", tone: "green", reached: true, final: true },
  { value: "callback", label: "Call back", tone: "blue", reached: true, final: false },
  // Not interested = don't call again: the number also goes on the do-not-call list.
  { value: "not_interested", label: "Not interested / Do not call", tone: "red", reached: true, final: true },
  { value: "not_answered", label: "Not answered / Busy", tone: "amber", reached: false, final: false },
  { value: "voicemail", label: "Voicemail", tone: "amber", reached: false, final: false },
  { value: "switched_off", label: "Switched off", tone: "amber", reached: false, final: false },
  { value: "wrong_number", label: "Wrong number", tone: "red", reached: false, final: true },
  { value: "already_customer", label: "Duplicate number", tone: "violet", reached: false, final: true },
  { value: "whatsapp_sent", label: "WhatsApp sent", tone: "teal", reached: false, final: false },
] as const;
/** Choices no longer offered, still named in History and Reports for calls logged with them. */
export const OLD_OUTCOMES = [
  { value: "busy", label: "Busy", tone: "amber", reached: false, final: false },
  { value: "do_not_call", label: "Do not call", tone: "red", reached: true, final: true },
] as const;
export type Outcome = (typeof OUTCOMES)[number]["value"];
/** Logged automatically by the softphone (not offered to agents as a choice). */
export const AUTO_OUTCOMES = [
  { value: "inbound_answered", label: "Inbound · answered", tone: "green", reached: true, final: false },
  { value: "inbound_missed", label: "Inbound · missed", tone: "red", reached: false, final: false },
  { value: "manual_call", label: "Keypad call", tone: "blue", reached: true, final: false },
] as const;
export const outcome = (v: string | null | undefined) => OUTCOMES.find((o) => o.value === v) ?? AUTO_OUTCOMES.find((o) => o.value === v) ?? OLD_OUTCOMES.find((o) => o.value === v);

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
      orderBy: status === "callback" ? { callbackAt: "asc" } : status === "new" ? [{ position: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] : { lastCalledAt: "asc" },
    });
    if (t) return t;
  }
  return null;
}

/** Saves a call (or WhatsApp) result and moves the number on: done, retry later, callback, or do-not-call. */
export async function recordOutcome(input: { targetId: string; agentId: string; outcome: Outcome; notes?: string | null; callbackAt?: Date | null; durationSec?: number | null; channel?: string; pbxCallId?: string | null }) {
  const t = await db.callTarget.findUnique({ where: { id: input.targetId }, include: { campaign: true } });
  if (!t) return { error: "Number not found." };
  const o = outcome(input.outcome);
  if (!o) return { error: "Choose an outcome." };
  if (input.outcome === "callback" && !input.callbackAt) return { error: "When should we call back?" };
  const attempts = input.outcome === "whatsapp_sent" ? t.attempts : t.attempts + 1;
  const dnc = input.outcome === "not_interested" || (input.outcome as string) === "do_not_call";
  const status = dnc ? "dnc"
    : input.outcome === "callback" ? "callback"
    : o.final ? "done"
    : attempts >= t.campaign.maxAttempts && input.outcome !== "whatsapp_sent" ? "done" : "retry"; // WhatsApp sent: the next number comes; this one returns later for a call
  await db.callLog.create({
    data: { targetId: t.id, campaignId: t.campaignId, agentId: input.agentId, phone: t.phone, outcome: input.outcome, notes: input.notes ?? null, durationSec: input.durationSec ?? null, pbxCallId: input.pbxCallId ?? null, channel: input.channel ?? (input.outcome === "whatsapp_sent" ? "whatsapp" : "phone") },
  });
  await db.callTarget.update({
    where: { id: t.id },
    data: {
      status, outcome: input.outcome, attempts, lastCalledAt: new Date(), callbackAt: input.outcome === "callback" ? input.callbackAt : null,
      notes: input.notes ? [t.notes, input.notes].filter(Boolean).join("\n") : t.notes,
    },
  });
  if (dnc) await db.dncNumber.upsert({ where: { phoneKey: t.phoneKey }, update: {}, create: { phoneKey: t.phoneKey, reason: `Not interested / do not call (${t.campaign.name})` } });
  return { ok: true as const, status };
}

/** Sends the number to the CRM (duplicate check and lead rotation as for any incoming lead). */
export async function convertToLead(targetId: string, agentName: string, agentId?: string) {
  const t = await db.callTarget.findUnique({ where: { id: targetId }, include: { campaign: true } });
  if (!t) return { error: "Number not found." };
  if (t.leadId) return { ok: true as const, leadId: t.leadId };
  const res = await ingestLead(
    { name: t.name ?? undefined, phone: t.phone, source: t.campaign.sourceName ?? undefined, campaign: t.campaign.name, message: [`From the calling team (${agentName})`, t.notes].filter(Boolean).join("\n") },
    "api",
    // Sales campaigns: the sales agent who called gets the lead (no rotation); CSR campaigns go round the sales team.
    { id: `calls-${t.campaignId}`, name: `Calls: ${t.campaign.name}`, sourceName: t.campaign.sourceName ?? "CC", ...(t.campaign.kind === "sales" && agentId ? { assigneeIds: [agentId] } : {}) },
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
  return rows.filter((r) => (phoneKey(r.phone) ?? "").length >= 7);
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
  // Each number keeps its row in the file, after the numbers already in the campaign; the call order is then applied.
  const base = (await db.callTarget.aggregate({ where: { campaignId }, _max: { rowNo: true } }))._max.rowNo ?? 0;
  let row = base;
  const data = rows.flatMap((r) => {
    const key = phoneKey(r.phone)!;
    if (skip.has(key) || seen.has(key)) return [];
    seen.add(key);
    row++;
    return [{ campaignId, phone: r.phone, phoneKey: key, name: r.name, extra: r.extra ? JSON.stringify(r.extra) : null, rowNo: row, position: row }];
  });
  for (let i = 0; i < data.length; i += 500) await db.callTarget.createMany({ data: data.slice(i, i + 500) });
  const camp = await db.callCampaign.findUnique({ where: { id: campaignId }, select: { callOrder: true } });
  if (data.length && camp && camp.callOrder !== "top") await applyCallOrder(campaignId);
  return { added: data.length, duplicates: rows.length - data.length - dnc.filter((d) => keys.includes(d.phoneKey)).length, dnc: dnc.length };
}

/**
 * Splits unassigned numbers into batches of `size`. With `plan` each agent gets their own number of batches (dealt in
 * turn, so a short list is shared fairly); without it, all remaining numbers are dealt round-robin to the agents.
 */
export async function makeBatches(campaignId: string, agentIds: string[], size: number, plan?: Record<string, number>, givenById?: string) {
  const free = await db.callTarget.findMany({ where: { campaignId, assigneeId: null, status: { in: ["new", "retry"] } }, select: { id: true }, orderBy: [{ position: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] });
  if (!free.length || !agentIds.length) return { batches: 0, numbers: 0, left: free.length };
  const agents = (await db.user.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } })).sort((a, b) => agentIds.indexOf(a.id) - agentIds.indexOf(b.id));
  const count = await db.callBatch.count({ where: { campaignId } });
  // The order agents get batches in: one each per round, until everyone has their number (or numbers run out).
  const turns: { id: string; name: string }[] = [];
  if (plan) {
    const want = new Map(agents.map((a) => [a.id, Math.max(0, Math.floor(plan[a.id] ?? 0))]));
    for (let round = 0; turns.length * size < free.length && [...want.values()].some((n) => n > round); round++) {
      for (const a of agents) if ((want.get(a.id) ?? 0) > round) turns.push(a);
    }
  } else {
    for (let i = 0; i * size < free.length; i++) turns.push(agents[i % agents.length]!);
  }
  let made = 0, used = 0;
  for (const agent of turns) {
    const slice = free.slice(used, used + size);
    if (!slice.length) break;
    const batch = await db.callBatch.create({ data: { campaignId, name: `Batch ${count + made + 1} · ${agent.name}`, assigneeId: agent.id, givenById: givenById ?? null } });
    await db.callTarget.updateMany({ where: { id: { in: slice.map((t) => t.id) } }, data: { batchId: batch.id, assigneeId: agent.id, givenById: givenById ?? null, givenAt: new Date() } });
    made++; used += slice.length;
  }
  return { batches: made, numbers: used, left: free.length - used };
}

/** People who can be given numbers: anyone whose roles allow working calls (Super Admins too, if asked). */
/**
 * People who can work a dialer. `kind` narrows it to a campaign's type: "csr" = the CSR Agent role, "sales" = everyone
 * else with dialer access (sales agents). Super Admins are listed for both.
 */
export async function callAgents(withSuperAdmins = true, kind?: "csr" | "sales") {
  const csr = { roles: { some: { role: { name: "CSR Agent" } } } };
  const dialer = { roles: { some: { role: { permissions: { some: { module: "calls", action: "edit" } } } } } };
  const narrow = kind === "csr" ? [dialer, csr] : kind === "sales" ? [dialer, { NOT: csr }] : [dialer];
  return db.user.findMany({
    where: { active: true, OR: [...(withSuperAdmins ? [{ isSuperAdmin: true }] : []), { AND: narrow }] },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
}
export const CAMPAIGN_KINDS = [["csr", "CSR (calling team)"], ["sales", "Sales agents"]] as const;

/**
 * Calling supervisors: run campaigns (numbers, batches, assigning), the wallboard and everyone's reports. Super Admins,
 * and people whose role gives Calls → Assign for everyone. Anyone with the CSR Agent role is always an agent here
 * (their own queue, callbacks, history and report only), whatever else their roles allow.
 */
export function isCallSupervisor(user: SessionUser) {
  if (user.isSuperAdmin) return true;
  if (user.roleNames.some((r) => r.trim().toLowerCase() === "csr agent")) return false;
  return scopeFor(user, "calls", "assign") === "all";
}


export const CALL_ORDERS = [["top", "Top first (file order)"], ["bottom", "Bottom first (last row first)"], ["random", "Random"], ["column", "By a column"]] as const;

/**
 * Puts the campaign's numbers in its call order (CallCampaign.callOrder): which numbers go into batches first and which
 * number an agent gets next. Numbers from before rows were remembered keep their upload order.
 */
export async function applyCallOrder(campaignId: string) {
  const c = await db.callCampaign.findUnique({ where: { id: campaignId }, select: { callOrder: true, orderField: true, orderDesc: true } });
  if (!c) return 0;
  const rows = await db.callTarget.findMany({ where: { campaignId }, select: { id: true, rowNo: true, createdAt: true, extra: true, name: true } });
  const row = (t: (typeof rows)[number]) => t.rowNo ?? Number.MAX_SAFE_INTEGER;
  rows.sort((a, b) => row(a) - row(b) || +a.createdAt - +b.createdAt);
  if (c.callOrder === "bottom") rows.reverse();
  else if (c.callOrder === "random") for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rows[i], rows[j]] = [rows[j]!, rows[i]!]; }
  else if (c.callOrder === "column" && c.orderField) {
    const val = (t: (typeof rows)[number]) => {
      if (c.orderField === "Name") return t.name ?? "";
      try { return String((JSON.parse(t.extra ?? "{}") as Record<string, string>)[c.orderField!] ?? ""); } catch { return ""; }
    };
    // Empty values last; numbers compared as numbers (10 after 9), the rest A→Z.
    rows.sort((a, b) => {
      const x = val(a), y = val(b);
      if (!x !== !y) return x ? -1 : 1;
      const r = x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" });
      return c.orderDesc ? -r : r;
    });
  }
  for (let i = 0; i < rows.length; i += 200) {
    await db.$transaction(rows.slice(i, i + 200).map((t, k) => db.callTarget.update({ where: { id: t.id }, data: { position: i + k + 1 } })));
  }
  return rows.length;
}

/**
 * Everyone who can be given call batches: Super Admins and anyone with Calls access through a role or a personal
 * exception (Settings → Users → Access). kind: csr (CSR Agent role) or sales (everyone else). canLog: they have
 * Calls → Edit, which the dialer needs to save results.
 */
export async function dialerPeople() {
  const users = await db.user.findMany({
    where: { active: true, OR: [{ isSuperAdmin: true }, { roles: { some: { role: { permissions: { some: { module: "calls", scope: { not: "none" } } } } } } }, { permissionOverrides: { some: { module: "calls", scope: { not: "none" } } } }] },
    select: { id: true, name: true, isSuperAdmin: true, title: true, roles: { select: { role: { select: { name: true, permissions: { where: { module: "calls" }, select: { action: true, scope: true } } } } } }, permissionOverrides: { where: { module: "calls" }, select: { action: true, scope: true } } },
    orderBy: { name: "asc" },
  });
  return users.map((u) => {
    const own = u.permissionOverrides.find((p) => p.action === "edit");
    const viaRole = u.roles.some((r) => r.role.permissions.some((p) => p.action === "edit" && p.scope !== "none"));
    const canLog = u.isSuperAdmin || (own ? own.scope !== "none" : viaRole);
    const csr = u.roles.some((r) => r.role.name.trim().toLowerCase() === "csr agent");
    return { id: u.id, name: u.name, kind: (csr ? "csr" : "sales") as "csr" | "sales", canLog, roles: u.isSuperAdmin ? "Super Admin" : u.roles.map((r) => r.role.name).join(", ") || u.title || "" };
  });
}
