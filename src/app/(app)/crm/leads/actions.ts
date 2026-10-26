"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { assignableUsers, logSystem, ownerBranch, parseAmount, phoneKey, resolveOwner } from "@/lib/crm";
import { str, type FormState } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { nextNumber } from "@/lib/sequence";
import type { SessionUser } from "@/lib/auth";

async function editableLead(user: SessionUser, id: string) {
  const scope = await scopeWhere(user, "crm.leads", "edit");
  return scope ? db.lead.findFirst({ where: { id, ...scope }, include: { status: true } }) : null;
}

/** Another lead/contact with the same phone or email — shown as a warning, not a hard block. */
async function findDuplicate(key: string | null, email: string | null, exceptLeadId?: string) {
  if (!key && !email) return null;
  const or = [...(key ? [{ phoneKey: key }] : []), ...(email ? [{ email }] : [])];
  const lead = await db.lead.findFirst({ where: { OR: or, NOT: exceptLeadId ? { id: exceptLeadId } : undefined }, include: { owner: true, status: true } });
  if (lead) return `A lead “${lead.name}” (${lead.status.name}, owner ${lead.owner?.name ?? "unassigned"}) already has this phone or email.`;
  const contact = await db.contact.findFirst({ where: { OR: or }, include: { owner: true } });
  if (contact) return `A contact “${contact.name}” (owner ${contact.owner?.name ?? "unassigned"}) already has this phone or email.`;
  return null;
}

/** Parses a posted [{type, value}] list, dropping blanks; at most 10 entries. */
function contactList(raw: string) {
  try {
    const v: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(v)) return [];
    return v
      .filter((e): e is { type?: unknown; value: string } => !!e && typeof e.value === "string" && e.value.trim() !== "")
      .map((e) => ({ type: String(e.type ?? "Other").slice(0, 20), value: e.value.trim().slice(0, 80) }))
      .slice(0, 10);
  } catch {
    return [];
  }
}

export async function saveLead(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const user = await requirePermission("crm.leads", id ? "edit" : "create");
  const existing = id ? await editableLead(user, id) : null;
  if (id && !existing) return { error: "Lead not found or you can't edit it." };

  const name = str(fd, "name");
  // The form posts every phone/email as a JSON list; the first ones double as the primary fields (search, duplicates).
  const phones = fd.has("phones") ? contactList(str(fd, "phones")) : null;
  const emails = fd.has("emails") ? contactList(str(fd, "emails")) : null;
  const phone = phones ? phones[0]?.value ?? "" : str(fd, "phone");
  const email = (emails ? emails[0]?.value ?? "" : str(fd, "email")).toLowerCase() || null;
  if (name.length < 2) return { error: "Name is required." };
  if (!phone && !email) return { error: "Add a phone number or email." };

  const key = phoneKey(phone);
  if (fd.get("confirm") !== "on") {
    const dup = await findDuplicate(key, email, id || undefined);
    if (dup) return { confirm: `${dup} Tick to save anyway.` };
  }

  const ownerId = await resolveOwner(user, "crm.leads", str(fd, "ownerId"), existing?.ownerId);
  const budgetMin = parseAmount(str(fd, "budgetMin"));
  const budgetMax = parseAmount(str(fd, "budgetMax"));
  // The unit/listing this enquiry is about; its project fills in the lead's project when none is chosen.
  const unit = str(fd, "unitId") ? await db.unit.findUnique({ where: { id: str(fd, "unitId") }, select: { id: true, projectId: true } }) : null;
  const projectId = (str(fd, "projectId") && (await db.project.findUnique({ where: { id: str(fd, "projectId") }, select: { id: true } }))?.id) || unit?.projectId || null;
  const data = {
    name, phone: phone || null, phoneKey: key, email,
    phone2: phones ? phones[1]?.value ?? null : str(fd, "phone2") || null,
    ...(phones && { phones: phones.length ? JSON.stringify(phones) : null }),
    ...(emails && { emails: emails.length ? JSON.stringify(emails) : null }),
    sourceId: str(fd, "sourceId") || null, campaign: str(fd, "campaign") || null, sourceInfo: str(fd, "sourceInfo") || null,
    projectId, ...(fd.has("unitId") && { unitId: unit?.id ?? null }),
    interest: str(fd, "interest") || null, propertyType: str(fd, "propertyType") || null,
    location: str(fd, "location") || null, budgetMin, budgetMax, notes: str(fd, "notes") || null,
    ownerId, branchId: await ownerBranch(ownerId),
  };

  let leadId = id;
  if (existing) {
    await db.lead.update({ where: { id }, data });
    if (existing.ownerId !== ownerId) {
      const owner = await db.user.findUnique({ where: { id: ownerId } });
      await logSystem({ leadId: id }, `Assigned to ${owner?.name}`, user.id);
      if (ownerId !== user.id) await notify(ownerId, `Lead assigned to you: ${name}`, { body: `By ${user.name}`, link: `/crm/leads/${id}`, email: true });
    }
    await audit(user.id, "update", "lead", id, `Updated lead ${name}`);
  } else {
    // A stage picked on the create screen, else the first open stage.
    const status = (str(fd, "statusId") && (await db.leadStatus.findFirst({ where: { id: str(fd, "statusId"), kind: "open", active: true } })))
      || (await db.leadStatus.findFirst({ where: { kind: "open", active: true }, orderBy: { sortOrder: "asc" } }));
    const lead = await db.lead.create({ data: { ...data, number: await nextNumber("lead"), statusId: status!.id, createdById: user.id } });
    leadId = lead.id;
    await logSystem({ leadId }, "Lead created", user.id);
    if (ownerId !== user.id) await notify(ownerId, `New lead assigned to you: ${name}`, { body: `By ${user.name}`, link: `/crm/leads/${leadId}`, email: true });
    await audit(user.id, "create", "lead", leadId, `Created lead ${name}`);
  }

  revalidatePath("/crm/leads");
  redirect(`/crm/leads/${leadId}`);
}

async function applyStatus(user: SessionUser, id: string, statusId: string) {
  const lead = await editableLead(user, id);
  if (!lead) return { error: "You can't change this lead." };
  const status = await db.leadStatus.findUnique({ where: { id: statusId } });
  if (!status) return { error: "Unknown status." };
  if (status.kind === "converted") return { error: "Use “Convert” on the lead to create a deal." };
  if (lead.statusId === statusId) return {};
  await db.lead.update({ where: { id }, data: { statusId } });
  await logSystem({ leadId: id }, `Status: ${lead.status.name} → ${status.name}`, user.id);
  return {};
}

/** Kanban drop. */
export async function moveLead(id: string, statusId: string) {
  const user = await requirePermission("crm.leads", "edit");
  const res = await applyStatus(user, id, statusId);
  revalidatePath("/crm/leads");
  return res;
}

/** Stage bar click on the lead page. */
export async function setLeadStatus(fd: FormData) {
  const user = await requirePermission("crm.leads", "edit");
  const id = str(fd, "leadId");
  await applyStatus(user, id, str(fd, "stepId"));
  revalidatePath(`/crm/leads/${id}`);
}

export async function bulkLeads(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("crm.leads", "edit");
  const ids = fd.getAll("ids").map(String);
  const op = str(fd, "op");
  if (!ids.length) return { error: "Select at least one lead." };

  if (op === "delete") {
    const scope = await scopeWhere(user, "crm.leads", "delete");
    if (!scope) return { error: "You can't delete leads." };
    const { count } = await db.lead.deleteMany({ where: { id: { in: ids }, ...scope } });
    await audit(user.id, "delete", "lead", null, `Deleted ${count} lead(s)`);
    revalidatePath("/crm/leads");
    return { ok: true, message: `Deleted ${count} lead(s).` };
  }

  const scope = await scopeWhere(user, "crm.leads", "edit");
  const leads = scope ? await db.lead.findMany({ where: { id: { in: ids }, ...scope }, select: { id: true } }) : [];

  if (op === "assign") {
    const target = (await assignableUsers(user, "crm.leads")).find((u) => u.id === str(fd, "ownerId"));
    if (!target) return { error: "Choose someone you can assign to." };
    for (const l of leads) {
      await db.lead.update({ where: { id: l.id }, data: { ownerId: target.id, branchId: target.branchId } });
      await logSystem({ leadId: l.id }, `Assigned to ${target.name}`, user.id);
    }
    if (target.id !== user.id && leads.length) await notify(target.id, `${leads.length} lead(s) assigned to you`, { body: `By ${user.name}`, link: "/crm/leads", email: true });
    revalidatePath("/crm/leads");
    return { ok: true, message: `Assigned ${leads.length} lead(s) to ${target.name}.` };
  }

  if (op === "status") {
    let changed = 0;
    for (const l of leads) if (!(await applyStatus(user, l.id, str(fd, "statusId"))).error) changed++;
    revalidatePath("/crm/leads");
    return { ok: true, message: `Updated ${changed} lead(s).` };
  }
  return { error: "Choose an action." };
}

export async function deleteLead(fd: FormData) {
  const user = await requirePermission("crm.leads", "delete");
  const scope = await scopeWhere(user, "crm.leads", "delete");
  const id = str(fd, "id");
  const lead = scope ? await db.lead.findFirst({ where: { id, ...scope } }) : null;
  if (lead) {
    await db.lead.delete({ where: { id } });
    await audit(user.id, "delete", "lead", id, `Deleted lead ${lead.name}`);
  }
  revalidatePath("/crm/leads");
  redirect("/crm/leads");
}

/** Lead → Contact (matched by phone or new) + Deal in the chosen pipeline. */
export async function convertLead(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("crm.leads", "edit");
  if (!can(user, "crm.deals", "create")) return { error: "Your role can't create deals." };
  const lead = await editableLead(user, str(fd, "leadId"));
  if (!lead) return { error: "Lead not found." };
  if (lead.convertedAt) return { error: "This lead is already converted." };

  const pipeline = await db.pipeline.findUnique({
    where: { id: str(fd, "pipelineId") },
    include: { stages: { where: { kind: "open" }, orderBy: { sortOrder: "asc" }, take: 1 } },
  });
  if (!pipeline?.stages[0]) return { error: "Choose a pipeline." };
  const title = str(fd, "title") || lead.name;

  let contact = lead.phoneKey ? await db.contact.findFirst({ where: { phoneKey: lead.phoneKey } }) : null;
  contact ??= await db.contact.create({
    data: { name: lead.name, phone: lead.phone, phoneKey: lead.phoneKey, phone2: lead.phone2, email: lead.email, sourceId: lead.sourceId, ownerId: lead.ownerId, branchId: lead.branchId },
  });

  const deal = await db.deal.create({
    data: {
      title, pipelineId: pipeline.id, stageId: pipeline.stages[0].id, contactId: contact.id, leadId: lead.id, sourceId: lead.sourceId,
      value: parseAmount(str(fd, "value")) ?? lead.budgetMax ?? lead.budgetMin, ownerId: lead.ownerId, branchId: lead.branchId,
    },
  });
  const converted = await db.leadStatus.findFirst({ where: { kind: "converted" }, orderBy: { sortOrder: "asc" } });
  await db.lead.update({ where: { id: lead.id }, data: { statusId: converted?.id ?? lead.statusId, convertedAt: new Date(), contactId: contact.id } });
  await logSystem({ leadId: lead.id }, `Converted to deal “${title}”`, user.id);
  await logSystem({ dealId: deal.id }, `Deal created from lead ${lead.name}`, user.id);
  await audit(user.id, "update", "lead", lead.id, `Converted lead ${lead.name} to deal ${title}`);

  revalidatePath("/crm/leads");
  redirect(`/crm/deals/${deal.id}`);
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "full name", "client", "client name", "customer"],
  phone: ["phone", "mobile", "phone number", "contact", "contact no", "cell"],
  email: ["email", "e-mail", "email address"],
  source: ["source", "lead source"],
  campaign: ["campaign", "ad", "ad name"],
  interest: ["interest", "purpose"],
  propertyType: ["property type", "type", "property"],
  location: ["location", "area", "project"],
  budget: ["budget", "price", "amount"],
  notes: ["notes", "note", "comments", "remarks", "message"],
};

export async function importLeads(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("crm.leads", "create");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > 5_000_000) return { error: "File is larger than 5 MB." };

  const parsed = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  const rows = parsed.data.slice(0, 5000);
  if (!rows.length) return { error: "No rows found. The first row must be column headers." };

  const headers = parsed.meta.fields ?? [];
  const col = (field: string) => headers.find((h) => HEADER_ALIASES[field]!.includes(h));
  const cols = Object.fromEntries(Object.keys(HEADER_ALIASES).map((f) => [f, col(f)]));
  if (!cols.name || (!cols.phone && !cols.email)) return { error: "CSV needs a “name” column and a “phone” or “email” column." };

  // Owners: me, one person, or round-robin across the chosen people.
  const assignable = await assignableUsers(user, "crm.leads");
  const mode = str(fd, "assign");
  const rr = fd.getAll("rr").map(String).filter((id) => assignable.some((u) => u.id === id));
  const pickOwner = (i: number) =>
    mode === "rr" && rr.length ? rr[i % rr.length]! : assignable.find((u) => u.id === mode)?.id ?? user.id;
  const branchOf = new Map(assignable.map((u) => [u.id, u.branchId]));

  const [sources, status] = await Promise.all([
    db.leadSource.findMany(),
    db.leadStatus.findFirst({ where: { kind: "open", active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const defaultSource = str(fd, "sourceId") || null;
  const skipDupes = fd.get("skipDuplicates") === "on";

  let created = 0, skipped = 0;
  const perOwner = new Map<string, number>();
  for (const r of rows) {
    const get = (f: string) => (cols[f] ? (r[cols[f]!] ?? "").trim() : "");
    const name = get("name");
    const phone = get("phone");
    const email = get("email").toLowerCase() || null;
    if (!name || (!phone && !email)) { skipped++; continue; }
    const key = phoneKey(phone);
    if (skipDupes && key && (await db.lead.findFirst({ where: { phoneKey: key }, select: { id: true } }))) { skipped++; continue; }

    const srcName = get("source").toLowerCase();
    const ownerId = pickOwner(created);
    const budget = parseAmount(get("budget"));
    const lead = await db.lead.create({
      data: {
        number: await nextNumber("lead"), name, phone: phone || null, phoneKey: key, email,
        sourceId: sources.find((s) => s.name.toLowerCase() === srcName)?.id ?? defaultSource,
        campaign: get("campaign") || null, interest: get("interest").toLowerCase() || null,
        propertyType: get("propertyType") || null, location: get("location") || null,
        budgetMin: budget, budgetMax: budget, notes: get("notes") || null,
        statusId: status!.id, ownerId, branchId: branchOf.get(ownerId) ?? user.branchId, createdById: user.id,
      },
    });
    await logSystem({ leadId: lead.id }, "Imported from CSV", user.id);
    perOwner.set(ownerId, (perOwner.get(ownerId) ?? 0) + 1);
    created++;
  }

  await audit(user.id, "create", "lead", null, `Imported ${created} lead(s) from ${file.name}`);
  for (const [ownerId, n] of perOwner) if (ownerId !== user.id) await notify(ownerId, `${n} imported lead(s) assigned to you`, { body: `By ${user.name}`, link: "/crm/leads", email: true });
  revalidatePath("/crm/leads");
  return { ok: true, message: `Imported ${created} lead(s)${skipped ? `, skipped ${skipped}` : ""}.` };
}
