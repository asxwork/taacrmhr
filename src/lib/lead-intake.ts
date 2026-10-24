import { randomBytes } from "node:crypto";
import { db } from "./db";
import { logSystem, parseAmount, phoneKey } from "./crm";
import { notify } from "./notify";

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

/** Next owner from the intake round-robin pool; falls back to the first active Super Admin. */
async function nextAssignee() {
  const ids = ((await getSetting(INTAKE_KEYS.assignees)) ?? "").split(",").filter(Boolean);
  const pool = ids.length ? await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, branchId: true }, orderBy: { name: "asc" } }) : [];
  if (pool.length) {
    const i = Number((await getSetting(INTAKE_KEYS.rrIndex)) ?? 0) % pool.length;
    await setSetting(INTAKE_KEYS.rrIndex, String(i + 1));
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
export async function ingestLead(input: IncomingLead, origin: "webform" | "facebook") {
  const name = clip(input.name) || "Unknown";
  const phone = clip(input.phone, 40);
  const email = clip(input.email).toLowerCase() || null;
  const key = phoneKey(phone);
  if (!key && !email) {
    await db.webhookLog.create({ data: { source: origin, status: "ignored", summary: `No phone or email for “${name}”` } });
    return { status: "ignored" as const };
  }
  const channel = origin === "facebook" ? "Facebook Lead Ads" : "website form";
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
    await db.webhookLog.create({ data: { source: origin, status: "merged", summary: `${name} matched existing lead`, leadId: existing.id } });
    return { status: "merged" as const, leadId: existing.id };
  }

  const [sources, status, owner] = await Promise.all([
    db.leadSource.findMany(),
    db.leadStatus.findFirst({ where: { kind: "open", active: true }, orderBy: { sortOrder: "asc" } }),
    nextAssignee(),
  ]);
  const wanted = (input.source || (origin === "facebook" ? "Facebook" : "Website")).toLowerCase();
  const source = sources.find((s) => s.name.toLowerCase() === wanted) ?? sources.find((s) => s.name.toLowerCase() === (origin === "facebook" ? "facebook" : "website"));
  const budget = input.budget ? parseAmount(input.budget) : null;
  const interest = ["buy", "rent", "invest", "sell"].includes((input.interest ?? "").toLowerCase()) ? input.interest!.toLowerCase() : null;

  const lead = await db.lead.create({
    data: {
      name, phone: phone || null, phoneKey: key, email, sourceId: source?.id ?? null, campaign: clip(input.campaign) || null,
      interest, propertyType: clip(input.propertyType) || null, location: clip(input.location) || null,
      budgetMin: budget, budgetMax: budget, notes: input.message ? clip(input.message, 2000) : null,
      statusId: status!.id, ownerId: owner?.id ?? null, branchId: owner?.branchId ?? null,
    },
  });
  await logSystem({ leadId: lead.id }, `Lead received from ${channel}`, null);
  await notify(owner?.id, `New lead: ${name}`, { body: `From ${channel}${phone ? ` · ${phone}` : ""}`, link: `/crm/leads/${lead.id}`, email: true });
  await db.webhookLog.create({ data: { source: origin, status: "created", summary: `Lead “${name}”${phone ? ` (${phone})` : ""}`, leadId: lead.id } });
  return { status: "created" as const, leadId: lead.id };
}
