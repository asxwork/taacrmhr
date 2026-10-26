import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { logSystem, parseAmount, phoneKey } from "./crm";
import { notify } from "./notify";
import { nextNumber } from "./sequence";

export const INTAKE_KEYS = {
  webformKey: "webform.key",
  assignees: "intake.assignees", // comma-separated user ids for round-robin
  rrIndex: "intake.rrIndex",
  facebookVerify: "facebook.verifyToken",
} as const;

export async function getSetting(key: string) {
  return (await db.setting.findUnique({ where: { key } }))?.value ?? null;
}
export async function setSetting(key: string, value: string) {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}
export const newSecret = () => randomBytes(24).toString("base64url");
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Where a lead came in: a named API connection (POST /api/v1/leads) carries its own source and rotation. */
export type IntakeVia = { id: string; name: string; sourceName?: string | null; assigneeIds?: string[] };

// Field names other tools use (Zapier, Make, Facebook, Google Forms, portal e-mails…), lower-cased with
// spaces/dashes as "_". The first match wins, so payloads work without hand-mapping every field.
const ALIASES: Record<keyof IncomingLead, string[]> = {
  name: ["name", "full_name", "fullname", "client_name", "customer_name", "contact_name", "your_name", "lead_name"],
  phone: ["phone", "mobile", "phone_number", "mobile_number", "cell", "contact", "contact_number", "whatsapp", "tel", "telephone"],
  email: ["email", "email_address", "e_mail", "mail"],
  source: ["source", "lead_source", "platform", "portal", "channel"],
  campaign: ["campaign", "campaign_name", "ad_name", "adset_name", "form_name", "utm_campaign"],
  message: ["message", "comments", "comment", "notes", "note", "enquiry", "inquiry", "requirement", "details", "description"],
  interest: ["interest", "purpose", "intent", "type"],
  propertyType: ["property_type", "propertytype", "property", "category", "property_category", "listing_type"],
  location: ["location", "area", "city", "society", "address", "preferred_location"],
  budget: ["budget", "price", "amount", "demand", "budget_range"],
};

/** Maps an incoming payload with any of the common field names to an IncomingLead. first_name + last_name are joined. */
export function normalizeIncoming(raw: Record<string, unknown>): IncomingLead {
  const flat = new Map<string, string>();
  for (const [k, v] of Object.entries(raw)) {
    if (v == null || typeof v === "object") continue;
    flat.set(k.trim().toLowerCase().replace(/[\s-]+/g, "_"), String(v));
  }
  const out: IncomingLead = {};
  for (const [field, names] of Object.entries(ALIASES) as [keyof IncomingLead, string[]][]) {
    const hit = names.find((n) => flat.get(n)?.trim());
    if (hit) out[field] = flat.get(hit)!.trim();
  }
  if (!out.name) {
    const joined = [flat.get("first_name"), flat.get("last_name")].filter((x) => x?.trim()).join(" ").trim();
    if (joined) out.name = joined;
  }
  return out;
}

/** Next owner from a connection's pool, else the main round-robin; falls back to the first active Super Admin. */
async function nextAssignee(via?: IntakeVia) {
  const own = via?.assigneeIds?.length ? via.assigneeIds : null;
  const ids = own ?? ((await getSetting(INTAKE_KEYS.assignees)) ?? "").split(",").filter(Boolean);
  const rrKey = own ? `${INTAKE_KEYS.rrIndex}.${via!.id}` : INTAKE_KEYS.rrIndex;
  const pool = ids.length ? await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, branchId: true }, orderBy: { name: "asc" } }) : [];
  if (pool.length) {
    const i = Number((await getSetting(rrKey)) ?? 0) % pool.length;
    await setSetting(rrKey, String(i + 1));
    return pool[i]!;
  }
  return db.user.findFirst({ where: { isSuperAdmin: true, active: true }, select: { id: true, branchId: true }, orderBy: { createdAt: "asc" } });
}

export type IncomingLead = {
  name?: string; phone?: string; email?: string; source?: string; campaign?: string; message?: string;
  interest?: string; propertyType?: string; location?: string; budget?: string;
};

const clip = (s: string | undefined, n = 190) => (s ?? "").trim().slice(0, n);

/**
 * Creates a lead from an outside channel. If an open lead already has this phone/email, the enquiry
 * is added to that lead's timeline instead (and its owner is alerted) — no duplicate is created.
 */
export async function ingestLead(input: IncomingLead, origin: "webform" | "facebook" | "api", via?: IntakeVia) {
  const logSource = origin === "api" && via ? `api:${via.name}` : origin;
  const name = clip(input.name) || "Unknown";
  const phone = clip(input.phone, 40);
  const email = clip(input.email).toLowerCase() || null;
  const key = phoneKey(phone);
  if (!key && !email) {
    await db.webhookLog.create({ data: { source: logSource, status: "ignored", summary: `No phone or email for “${name}”` } });
    return { status: "ignored" as const };
  }
  const channel = via?.name ?? (origin === "facebook" ? "Facebook Lead Ads" : "website form");
  const details = [
    input.message && clip(input.message, 2000),
    input.campaign && `Campaign: ${clip(input.campaign)}`,
    input.location && `Location: ${clip(input.location)}`,
    input.budget && `Budget: ${clip(input.budget)}`,
  ].filter(Boolean).join("\n");

  const existing = await db.lead.findFirst({
    where: { OR: [...(key ? [{ phoneKey: key }] : []), ...(email ? [{ email }] : [])], status: { kind: "open" } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    await db.activity.create({
      data: { type: "note", subject: `New enquiry via ${channel}`, body: details || null, doneAt: new Date(), leadId: existing.id, ownerId: existing.ownerId, branchId: existing.branchId },
    });
    await db.lead.update({ where: { id: existing.id }, data: { lastActivityAt: new Date() } });
    await notify(existing.ownerId, `Repeat enquiry: ${existing.name}`, { body: `Came in again via ${channel}.`, link: `/crm/leads/${existing.id}`, email: true });
    await db.webhookLog.create({ data: { source: logSource, status: "merged", summary: `${name} matched existing lead`, leadId: existing.id } });
    return { status: "merged" as const, leadId: existing.id };
  }

  const [sources, status, owner] = await Promise.all([
    db.leadSource.findMany(),
    db.leadStatus.findFirst({ where: { kind: "open", active: true }, orderBy: { sortOrder: "asc" } }),
    nextAssignee(via),
  ]);
  const wanted = (input.source || via?.sourceName || (origin === "facebook" ? "Facebook" : "Website")).toLowerCase();
  const source = sources.find((s) => s.name.toLowerCase() === wanted) ?? sources.find((s) => s.name.toLowerCase() === (origin === "facebook" ? "facebook" : "website"));
  const budget = input.budget ? parseAmount(input.budget) : null;
  const interest = ["buy", "rent", "invest", "sell"].includes((input.interest ?? "").toLowerCase()) ? input.interest!.toLowerCase() : null;

  const lead = await db.lead.create({
    data: {
      number: await nextNumber("lead"), name, phone: phone || null, phoneKey: key, email, sourceId: source?.id ?? null, campaign: clip(input.campaign) || null,
      interest, propertyType: clip(input.propertyType) || null, location: clip(input.location) || null,
      budgetMin: budget, budgetMax: budget, notes: input.message ? clip(input.message, 2000) : null,
      statusId: status!.id, ownerId: owner?.id ?? null, branchId: owner?.branchId ?? null,
    },
  });
  await logSystem({ leadId: lead.id }, `Lead received from ${channel}`, null);
  await notify(owner?.id, `New lead: ${name}`, { body: `From ${channel}${phone ? ` · ${phone}` : ""}`, link: `/crm/leads/${lead.id}`, email: true });
  await db.webhookLog.create({ data: { source: logSource, status: "created", summary: `Lead “${name}”${phone ? ` (${phone})` : ""}`, leadId: lead.id } });
  return { status: "created" as const, leadId: lead.id };
}
