"use server";

import { leadChangeWhere } from "@/lib/lead-lock";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { assignableUsers, logSystem, ownerBranch, parseAmount, phoneKey, resolveOwner } from "@/lib/crm";
import { str, type FormState } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { nextNumber } from "@/lib/sequence";
import type { SessionUser } from "@/lib/auth";
import { manualHoldError } from "@/lib/lead-hold";
import { fieldAccess } from "@/lib/field-rules";
import { applyLeadStatus, runBulkLeads } from "@/lib/lead-ops";
import { attachUnitToDeal, unitWhere } from "@/lib/inventory";

async function editableLead(user: SessionUser, id: string) {
  // Old employees' leads: only a Super Admin can change them (lib/lead-lock.ts).
  const scope = await leadChangeWhere(user, "edit");
  return scope ? db.lead.findFirst({ where: { id, ...scope }, include: { status: true } }) : null;
}

/** Another lead/contact with the same phone or email — shown as a warning, not a hard block. */
async function findDuplicate(key: string | null, email: string | null, exceptLeadId?: string) {
  if (!key && !email) return null;
  const or = [...(key ? [{ phoneKey: key }] : []), ...(email ? [{ email }] : [])];
  const [lead, contact] = await Promise.all([
    db.lead.findFirst({ where: { OR: or, NOT: exceptLeadId ? { id: exceptLeadId } : undefined }, include: { owner: true, status: true } }),
    db.contact.findFirst({ where: { OR: or }, include: { owner: true } }),
  ]);
  if (lead) return `A lead “${lead.name}” (${lead.status.name}, owner ${lead.owner?.name ?? "unassigned"}) already has this phone or email.`;
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
  // Field rules: someone who can't fully see a lead's phone/email/budget can't change them on an existing lead,
  // so the stored values are kept (a masked value must never overwrite the real one).
  const fields = await fieldAccess(user);
  const lockPhone = !!existing && fields["lead.phone"] !== "full";
  const lockEmail = !!existing && fields["lead.email"] !== "full";
  const lockBudget = !!existing && fields["lead.budget"] !== "full";
  // The form posts every phone/email as a JSON list; the first ones double as the primary fields (search, duplicates).
  const phones = !lockPhone && fd.has("phones") ? contactList(str(fd, "phones")) : null;
  const emails = !lockEmail && fd.has("emails") ? contactList(str(fd, "emails")) : null;
  const phone = lockPhone ? existing!.phone ?? "" : phones ? phones[0]?.value ?? "" : str(fd, "phone");
  const email = lockEmail ? existing!.email : (emails ? emails[0]?.value ?? "" : str(fd, "email")).toLowerCase() || null;
  if (name.length < 2) return { error: "Name is required." };
  if (!phone && !email) return { error: "Add a phone number or email." };

  const key = phoneKey(phone);
  if (fd.get("confirm") !== "on") {
    const dup = await findDuplicate(key, email, id || undefined);
    if (dup) return { confirm: `${dup} Tick to save anyway.` };
  }

  const budgetMin = lockBudget ? existing!.budgetMin : parseAmount(str(fd, "budgetMin"));
  const budgetMax = lockBudget ? existing!.budgetMax : parseAmount(str(fd, "budgetMax"));
  // The unit/listing this enquiry is about; its project fills in the lead's project when none is chosen.
  const [ownerId, unit, project] = await Promise.all([
    resolveOwner(user, "crm.leads", str(fd, "ownerId"), existing?.ownerId),
    str(fd, "unitId") ? db.unit.findUnique({ where: { id: str(fd, "unitId") }, select: { id: true, projectId: true } }) : null,
    str(fd, "projectId") && str(fd, "projectId") !== "__other" ? db.project.findUnique({ where: { id: str(fd, "projectId") }, select: { id: true } }) : null,
  ]);
  const projectId = project?.id || unit?.projectId || null;
  const data = {
    name, email,
    ...(!lockPhone && { phone: phone || null, phoneKey: key, phone2: phones ? phones[1]?.value ?? null : str(fd, "phone2") || null }),
    ...(phones && { phones: phones.length ? JSON.stringify(phones) : null }),
    ...(emails && { emails: emails.length ? JSON.stringify(emails) : null }),
    sourceId: str(fd, "sourceId") || null, campaign: str(fd, "campaign") || null, sourceInfo: str(fd, "sourceInfo") || null,
    // "Other": a project typed in that isn't in the Inventory list.
    projectId, projectName: !projectId && str(fd, "projectId") === "__other" ? str(fd, "projectName").slice(0, 190) || null : null,
    ...(fd.has("unitId") && { unitId: unit?.id ?? null }),
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
    const picked = str(fd, "statusId") && !(await manualHoldError(str(fd, "statusId"))) ? str(fd, "statusId") : "";
    const status = (picked && (await db.leadStatus.findFirst({ where: { id: picked, kind: "open", active: true } })))
      || (await db.leadStatus.findFirst({ where: { kind: "open", active: true }, orderBy: { sortOrder: "asc" } }));
    const lead = await db.lead.create({ data: { ...data, number: await nextNumber("lead"), statusId: status!.id, createdById: user.id } });
    leadId = lead.id;
    await Promise.all([
      logSystem({ leadId }, "Lead created", user.id),
      ownerId !== user.id ? notify(ownerId, `New lead assigned to you: ${name}`, { body: `By ${user.name}`, link: `/crm/leads/${leadId}`, email: true }) : null,
      audit(user.id, "create", "lead", leadId, `Created lead ${name}`),
    ]);
    await (await import("@/lib/lead-rules")).leadEvent("created", leadId);
  }

  revalidatePath("/crm/leads");
  redirect(`/crm/leads/${leadId}`);
}

/** Kanban drop. */
export async function moveLead(id: string, statusId: string) {
  const user = await requirePermission("crm.leads", "edit");
  const res = await applyLeadStatus(user, id, statusId);
  revalidatePath("/crm/leads");
  return res;
}

/** Stage bar click on the lead page. */
export async function setLeadStatus(fd: FormData) {
  const user = await requirePermission("crm.leads", "edit");
  const id = str(fd, "leadId");
  await applyLeadStatus(user, id, str(fd, "stepId"));
  revalidatePath(`/crm/leads/${id}`);
}

export async function bulkLeads(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("crm.leads", "edit");
  const res = await runBulkLeads(user, fd);
  revalidatePath("/crm/leads");
  return res;
}

export async function deleteLead(fd: FormData) {
  const user = await requirePermission("crm.leads", "delete");
  const scope = await leadChangeWhere(user, "delete");
  const id = str(fd, "id");
  const lead = scope ? await db.lead.findFirst({ where: { id, ...scope } }) : null;
  if (lead) {
    await (await import("@/lib/lead-trash")).trashLeads([id], user);
    await audit(user.id, "delete", "lead", id, `Moved lead ${lead.name} to the Trash`);
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

  // The property this deal is for: picked in the convert form (defaults to the lead's linked unit).
  const unitScope = await unitWhere(user, "view");
  const unitId = fd.has("unitId") ? str(fd, "unitId") : lead.unitId ?? "";
  const unit = unitId && unitScope ? await db.unit.findFirst({ where: { id: unitId, ...unitScope }, include: { project: true, block: true } }) : null;
  if (unit && unit.activeDealId) return { error: `${unit.unitNo} is already ${unit.status} through another deal. Choose another unit or none.` };

  let contact = lead.phoneKey ? await db.contact.findFirst({ where: { phoneKey: lead.phoneKey } }) : null;
  contact ??= await db.contact.create({
    data: { name: lead.name, phone: lead.phone, phoneKey: lead.phoneKey, phone2: lead.phone2, email: lead.email, sourceId: lead.sourceId, ownerId: lead.ownerId, branchId: lead.branchId },
  });

  const deal = await db.deal.create({
    data: {
      title, pipelineId: pipeline.id, stageId: pipeline.stages[0].id, contactId: contact.id, leadId: lead.id, sourceId: lead.sourceId,
      value: parseAmount(str(fd, "value")) ?? unit?.price ?? lead.budgetMax ?? lead.budgetMin, ownerId: lead.ownerId, branchId: lead.branchId,
    },
  });
  if (unit) {
    const error = await attachUnitToDeal(deal, unit, user.id);
    if (error) await logSystem({ dealId: deal.id }, `Couldn't link ${unit.unitNo}: ${error}`, user.id);
  }
  const converted = await db.leadStatus.findFirst({ where: { kind: "converted" }, orderBy: { sortOrder: "asc" } });
  await db.lead.update({ where: { id: lead.id }, data: { statusId: converted?.id ?? lead.statusId, convertedAt: new Date(), contactId: contact.id } });
  { const lr = await import("@/lib/lead-rules"); const p = await lr.leadPayload(lead.id); if (p) void lr.fireHook("lead.converted", { lead: p }); }
  await logSystem({ leadId: lead.id }, `Converted to deal “${title}”`, user.id);
  await logSystem({ dealId: deal.id }, `Deal created from lead ${lead.name}`, user.id);
  await audit(user.id, "update", "lead", lead.id, `Converted lead ${lead.name} to deal ${title}`);

  revalidatePath("/crm/leads");
  redirect(`/crm/deals/${deal.id}`);
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "full name", "fullname", "client", "client name", "customer", "customer name", "lead name", "contact name", "title"],
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  phone: ["phone", "mobile", "phone number", "mobile number", "mobile no", "contact", "contact no", "contact number", "cell", "cell number", "whatsapp", "whatsapp number", "phone 1", "work phone", "number", "phone no"],
  phone2: ["phone 2", "alternate phone", "alternate number", "other phone", "second phone", "phone2", "mobile 2"],
  email: ["email", "e mail", "email address", "mail"],
  source: ["source", "lead source", "platform"],
  campaign: ["campaign", "campaign name", "ad", "ad name", "adset name", "form name"],
  interest: ["interest", "purpose"],
  propertyType: ["property type", "type", "property"],
  location: ["location", "area", "project", "city"],
  budget: ["budget", "price", "amount"],
  notes: ["notes", "note", "comments", "comment", "remarks", "message", "description", "details"],
};
// "Phone_Number", "E-mail", " Full  Name " all match: lower case, _ and - become spaces.
const normHeader = (h: string) => h.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");
const MAX_IMPORT = 50_000;

/** Rows of a CSV or the first sheet of an .xlsx, with normalised headers. */
async function readLeadFile(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return { headers: [], rows: [] };
    const text = (v: unknown): string => v == null ? "" : typeof v === "object" ? ("text" in (v as object) ? String((v as { text: unknown }).text) : "result" in (v as object) ? String((v as { result: unknown }).result ?? "") : "richText" in (v as object) ? (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("") : v instanceof Date ? v.toISOString() : "") : String(v);
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { headers[i] = normHeader(text(c.value)); });
    const rows: Record<string, string>[] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const r: Record<string, string> = {};
      row.eachCell({ includeEmpty: false }, (c, i) => { if (headers[i]) r[headers[i]!] = text(c.value); });
      rows.push(r);
    });
    return { headers: headers.filter(Boolean), rows };
  }
  const parsed = Papa.parse<Record<string, string>>((await file.text()).replace(/^\uFEFF/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: normHeader });
  return { headers: parsed.meta.fields ?? [], rows: parsed.data };
}

/**
 * Leads from a CSV or Excel file. Every row with a name, phone or email comes in (a row with only a phone is named
 * "No name"); saved in bulk so thousands of rows finish well inside the server's time limit. The result says exactly
 * how many rows were read, imported and skipped, and why.
 */
export async function importLeads(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("crm.leads", "create");
  if (!can(user, "crm.leads", "import")) return { error: "Your role can't import leads (Roles & Permissions → Leads → Import files)." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or Excel file." };
  if (file.size > 25_000_000) return { error: "File is larger than 25 MB. Split it into two files." };

  let read: Awaited<ReturnType<typeof readLeadFile>>;
  try { read = await readLeadFile(file); } catch { return { error: "Couldn't read that file. Use a .csv or .xlsx file." }; }
  const { headers, rows: all } = read;
  if (!all.length) return { error: "No rows found. The first row must be column headers." };
  if (all.length > MAX_IMPORT) return { error: `The file has ${all.length.toLocaleString()} rows; import at most ${MAX_IMPORT.toLocaleString()} at a time (split the file).` };
  const col = (field: string) => headers.find((h) => HEADER_ALIASES[field]!.includes(h));
  const cols = Object.fromEntries(Object.keys(HEADER_ALIASES).map((f) => [f, col(f)]));
  if (!cols.name && !cols.firstName && !cols.phone && !cols.email) return { error: `No name, phone or email column found. Columns in the file: ${headers.slice(0, 12).join(", ")}.` };

  // Owners: me, one person, or round-robin across the chosen people.
  const assignable = await assignableUsers(user, "crm.leads");
  const mode = str(fd, "assign");
  const rr = fd.getAll("rr").map(String).filter((id) => assignable.some((u) => u.id === id));
  const pickOwner = (i: number) => mode === "rr" && rr.length ? rr[i % rr.length]! : assignable.find((u) => u.id === mode)?.id ?? user.id;
  const branchOf = new Map(assignable.map((u) => [u.id, u.branchId]));
  const [sources, status] = await Promise.all([
    db.leadSource.findMany(),
    db.leadStatus.findFirst({ where: { kind: "open", active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  if (!status) return { error: "No open lead stage exists (Settings → CRM → Lead statuses)." };
  const defaultSource = str(fd, "sourceId") || null;
  const skipDupes = fd.get("skipDuplicates") === "on";

  // Read every row first.
  type Row = { line: number; name: string; phone: string | null; phone2: string | null; key: string | null; email: string | null; r: Record<string, string> };
  const ready: Row[] = [];
  let empty = 0;
  all.forEach((r, i) => {
    const get = (f: string) => (cols[f] ? String(r[cols[f]!] ?? "").trim() : "");
    // A cell can hold two numbers ("0300 1234567, 0321 7654321"): first is the phone, second the alternate.
    const nums = get("phone").split(/\s*[,;/|]\s*|\s{2,}/).map((x) => x.trim()).filter((x) => /\d{6,}/.test(x.replace(/\D/g, "")));
    const phone = nums[0] ?? (get("phone") || null);
    const phone2 = get("phone2") || nums[1] || null;
    const email = get("email").toLowerCase() || null;
    const name = get("name") || [get("firstName"), get("lastName")].filter(Boolean).join(" ");
    if (!name && !phone && !email) { empty++; return; }
    ready.push({ line: i + 2, name: (name || "No name").slice(0, 190), phone, phone2, key: phoneKey(phone), email, r });
  });

  // Duplicates: phones already in AMS (one query per 1,000 numbers) and repeats inside the file.
  const dupes: number[] = [];
  let rowsIn = ready;
  if (skipDupes) {
    const keys = [...new Set(ready.map((x) => x.key).filter((k): k is string => !!k))];
    const known = new Set<string>();
    for (let i = 0; i < keys.length; i += 1000) {
      for (const l of await db.lead.findMany({ where: { phoneKey: { in: keys.slice(i, i + 1000) } }, select: { phoneKey: true } })) if (l.phoneKey) known.add(l.phoneKey);
    }
    const seen = new Set<string>();
    rowsIn = ready.filter((x) => {
      if (!x.key) return true;
      if (known.has(x.key) || seen.has(x.key)) { dupes.push(x.line); return false; }
      seen.add(x.key);
      return true;
    });
  }

  // Lead numbers for the whole file in one step, then save in batches.
  const now = new Date();
  const seq = rowsIn.length ? await db.sequence.upsert({ where: { name: "lead" }, update: { value: { increment: rowsIn.length } }, create: { name: "lead", value: rowsIn.length } }) : null;
  const firstNo = seq ? seq.value - rowsIn.length + 1 : 0;
  const perOwner = new Map<string, number>();
  const leads = rowsIn.map((x, i) => {
    const get = (f: string) => (cols[f] ? String(x.r[cols[f]!] ?? "").trim() : "");
    const srcName = get("source").toLowerCase();
    const ownerId = pickOwner(i);
    perOwner.set(ownerId, (perOwner.get(ownerId) ?? 0) + 1);
    const budget = parseAmount(get("budget"));
    return {
      id: randomUUID().replace(/-/g, "").slice(0, 25),
      number: firstNo + i, name: x.name, phone: x.phone, phone2: x.phone2, phoneKey: x.key, email: x.email,
      sourceId: sources.find((s) => s.name.toLowerCase() === srcName)?.id ?? defaultSource,
      campaign: get("campaign").slice(0, 190) || null, interest: get("interest").toLowerCase().slice(0, 60) || null,
      propertyType: get("propertyType").slice(0, 190) || null, location: get("location").slice(0, 190) || null,
      budgetMin: budget, budgetMax: budget, notes: get("notes").slice(0, 8000) || null,
      statusId: status.id, ownerId, branchId: branchOf.get(ownerId) ?? user.branchId, createdById: user.id,
      createdAt: now, assignedAt: now, statusChangedAt: now,
    };
  });
  let created = 0;
  try {
    for (let i = 0; i < leads.length; i += 500) {
      const part = leads.slice(i, i + 500);
      await db.lead.createMany({ data: part });
      await db.activity.createMany({ data: part.map((l) => ({ leadId: l.id, type: "system", subject: `Imported from ${file.name.slice(0, 120)}`, doneAt: now, createdAt: now, createdById: user.id, ownerId: user.id })) });
      created += part.length;
    }
  } catch (e) {
    await audit(user.id, "create", "lead", null, `Imported ${created} of ${leads.length} lead(s) from ${file.name} (stopped: ${e instanceof Error ? e.message.slice(0, 120) : "error"})`);
    revalidatePath("/crm/leads");
    return { error: `Stopped after ${created.toLocaleString()} of ${leads.length.toLocaleString()} leads: ${e instanceof Error ? e.message.slice(0, 200) : "unknown error"}. Import the file again with “Skip rows whose phone already exists” ticked to add the rest.` };
  }

  await audit(user.id, "create", "lead", null, `Imported ${created} lead(s) from ${file.name}`);
  for (const [ownerId, n] of perOwner) if (ownerId !== user.id) await notify(ownerId, `${n} imported lead(s) assigned to you`, { body: `By ${user.name}`, link: "/crm/leads", email: true });
  revalidatePath("/crm/leads");
  const lines = (l: number[]) => `${l.slice(0, 8).join(", ")}${l.length > 8 ? "…" : ""}`;
  const skippedText = [
    dupes.length ? `${dupes.length.toLocaleString()} already in AMS or repeated in the file (rows ${lines(dupes)})` : "",
    empty ? `${empty.toLocaleString()} empty rows` : "",
  ].filter(Boolean).join("; ");
  return { ok: true, message: `Read ${all.length.toLocaleString()} rows: imported ${created.toLocaleString()} lead(s)${skippedText ? `. Skipped ${skippedText}` : ""}.` };
}

/** Imports a full Excel export (leads + activities). Company-wide lead access or Super Admin only, since it can update any lead. */
export async function importLeadsFull(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("crm.leads", "create");
  if (!can(user, "crm.leads", "import")) return { error: "Your role can't import leads (Roles & Permissions → Leads → Import files)." };
  const { scopeFor } = await import("@/lib/permissions");
  if (!user.isSuperAdmin && scopeFor(user, "crm.leads", "edit") !== "all") return { error: "Only a Super Admin or someone with company-wide lead access can import a full backup." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the Excel file." };
  if (file.size > 20_000_000) return { error: "File is larger than 20 MB." };
  if (!/\.xlsx$/i.test(file.name)) return { error: "Use the .xlsx file from “Export with activities”." };
  const { importLeadsWorkbook } = await import("@/lib/lead-backup");
  const res = await importLeadsWorkbook(await file.arrayBuffer(), user.id);
  if ("error" in res) return { error: res.error };
  await audit(user.id, "create", "lead", null, `Imported ${file.name}: ${res.created} new, ${res.updated} updated, ${res.activities} activities`);
  revalidatePath("/crm/leads");
  return { ok: true, message: `Done: ${res.created} new lead(s), ${res.updated} updated, ${res.activities} activit${res.activities === 1 ? "y" : "ies"} added.` };
}
