// Import from Bitrix24: leads, their activities (to-dos, tasks, calls) and stage history, from the CSV reports
// exported out of Bitrix (SQL lab). Files are recognised by their columns, so all of them can be dropped at once.
// Leads already imported (same Bitrix ID) are skipped, so running it twice is safe.
import { randomUUID } from "node:crypto";
import Papa from "papaparse";
import { db } from "./db";
import { phoneKey } from "./crm-shared";

type Row = Record<string, string>;
export type BitrixFiles = { leads: Row[]; activities: Row[]; history: Row[]; ignored: string[] };

export function readBitrixFiles(files: { name: string; text: string }[]): BitrixFiles {
  const out: BitrixFiles = { leads: [], activities: [], history: [], ignored: [] };
  for (const f of files) {
    const rows = Papa.parse<Row>(f.text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
    const cols = new Set(Object.keys(rows[0] ?? {}));
    if (cols.has("full_name") && cols.has("status_name") && cols.has("assigned_by_name")) out.leads.push(...rows);
    else if (cols.has("provider_id") && cols.has("lead_id")) out.activities.push(...rows);
    else if (cols.has("lead_id") && cols.has("status_name") && cols.has("assigned_by_name")) out.history.push(...rows);
    else out.ignored.push(f.name);
  }
  return out;
}

/** Bitrix dates are Karachi time ("2026-02-20 14:07:31"). */
const when = (s: string | undefined) => {
  if (!s?.trim()) return null;
  const d = new Date(`${s.trim().replace(" ", "T")}+05:00`);
  return Number.isNaN(+d) ? null : d;
};
/** [url=…]text[/url] → the link; other BBCode tags removed. */
const clean = (s: string | undefined) => (s ?? "").replace(/\[url=([^\]]+)\]([^[]*)\[\/url\]/gi, (_, u, t) => (t && t !== u ? `${t} (${u})` : u)).replace(/\[\/?[a-z*]+(=[^\]]*)?\]/gi, "").replace(/\r/g, "").trim();
/** "[MOBILE] 92 347 7848416, [WORK] +923002788927" → ["+92 347 7848416", …] */
const multi = (s: string | undefined) => (s ?? "").split(/,\s*(?=\[)/).map((p) => ({ type: (/^\[([A-Z]+)\]/.exec(p.trim())?.[1] ?? "OTHER").toLowerCase(), value: p.replace(/^\s*\[[A-Z]+\]\s*/, "").trim() })).filter((p) => p.value);
const prettyPhone = (v: string) => { const d = v.replace(/\D/g, ""); return d.startsWith("92") && d.length === 12 ? `+92 ${d.slice(2, 5)} ${d.slice(5)}` : v; };

const STAGE_MAP: Record<string, string> = { Appointment: "Site Visit", "Good lead": "Complete lead" };
const JUNK = new Set(["Not Interested", "Not Valid", "Junk Lead"]);

/** What the import will do, before doing it. */
export async function analyzeBitrix(f: BitrixFiles) {
  const [users, employees, statuses, sources, demo, already] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
    db.employee.findMany({ where: { userId: { not: null } }, select: { fullName: true, userId: true } }),
    db.leadStatus.findMany({ select: { id: true, name: true } }),
    db.leadSource.findMany({ select: { id: true, name: true } }),
    db.lead.count({ where: { bitrixId: null } }),
    db.lead.count({ where: { bitrixId: { in: f.leads.map((l) => Number(l.id)).filter(Boolean) } } }),
  ]);
  const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const userFor = (name: string) => users.find((u) => key(u.name) === key(name))?.id ?? employees.find((e) => key(e.fullName) === key(name))?.userId ?? null;
  const count = (rows: Row[], k: string) => { const m = new Map<string, number>(); for (const r of rows) m.set(r[k] ?? "", (m.get(r[k] ?? "") ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const owners = count(f.leads, "assigned_by_name").map(([name, n]) => ({ name, n, userId: name === "The Advisor Associates" ? "admin" : userFor(name) }));
  const stageName = (s: string) => STAGE_MAP[s] ?? s;
  const stages = count(f.leads, "status_name").filter(([s]) => s).map(([name, n]) => ({ name, n, as: stageName(name), exists: statuses.some((x) => key(x.name) === key(stageName(name))) }));
  const srcs = count(f.leads, "source_name").filter(([s]) => s).map(([name, n]) => ({ name, n, exists: sources.some((x) => key(x.name) === key(name)) }));
  const actIds = new Set(f.activities.map((a) => a.id));
  return { leads: f.leads.length, activities: actIds.size, history: f.history.length, ignored: f.ignored, owners, stages, sources: srcs, demo, already };
}

/**
 * Imports. deleteDemo removes every lead that didn't come from Bitrix first (with its activities). Agents are
 * matched by name to AMS logins; the Bitrix company account goes to the person importing.
 */
export async function importBitrix(f: BitrixFiles, opts: { deleteDemo: boolean; userId: string }) {
  const t0 = Date.now();
  let deleted = 0;
  if (opts.deleteDemo) deleted = (await db.lead.deleteMany({ where: { bitrixId: null } })).count;

  const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const [users, employees] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, branchId: true } }),
    db.employee.findMany({ where: { userId: { not: null } }, select: { fullName: true, userId: true } }),
  ]);
  const branchOf = new Map(users.map((u) => [u.id, u.branchId]));
  const userFor = (name: string | undefined) => {
    if (!name) return null;
    if (name === "The Advisor Associates") return opts.userId;
    return users.find((u) => key(u.name) === key(name))?.id ?? employees.find((e) => key(e.fullName) === key(name))?.userId ?? null;
  };

  // Stages and sources: use the ones that exist (by name), create the rest.
  const statuses = await db.leadStatus.findMany();
  let order = Math.max(0, ...statuses.map((s) => s.sortOrder));
  const statusFor = new Map<string, string>();
  for (const name of new Set(f.leads.map((l) => l.status_name).concat(f.history.map((h) => h.status_name)).filter(Boolean))) {
    const want = STAGE_MAP[name] ?? name;
    let s = statuses.find((x) => key(x.name) === key(want));
    if (!s) {
      const semantic = f.leads.find((l) => l.status_name === name)?.status_semantic_id;
      s = await db.leadStatus.create({ data: { name: want, kind: JUNK.has(want) || semantic === "F" ? "junk" : semantic === "S" ? "converted" : "open", sortOrder: ++order, color: JUNK.has(want) || semantic === "F" ? "red" : "blue" } });
      statuses.push(s);
    }
    statusFor.set(name, s.id);
  }
  const fallbackStatus = statuses.find((s) => s.systemKey === "new")?.id ?? statuses.find((s) => s.kind === "open")!.id;
  const sources = await db.leadSource.findMany();
  const sourceFor = new Map<string, string>();
  for (const name of new Set(f.leads.map((l) => l.source_name).filter(Boolean))) {
    let s = sources.find((x) => key(x.name) === key(name));
    if (!s) { s = await db.leadSource.create({ data: { name, sortOrder: sources.length + 1 } }); sources.push(s); }
    sourceFor.set(name, s.id);
  }

  // Leads (skipping ones already imported). The Bitrix ID becomes the AMS lead number, so agents keep using it.
  const existing = new Set((await db.lead.findMany({ where: { bitrixId: { not: null } }, select: { bitrixId: true } })).map((l) => l.bitrixId));
  const idFor = new Map<number, { id: string; ownerId: string | null; closed: boolean }>();
  const leadRows = [];
  let skipped = 0, maxNo = 0;
  for (const l of f.leads) {
    const bx = Number(l.id);
    if (!bx) continue;
    maxNo = Math.max(maxNo, bx);
    if (existing.has(bx)) { skipped++; continue; }
    const phones = multi(l.phone).map((p) => ({ type: p.type === "work" ? "work" : "mobile", value: prettyPhone(p.value) }));
    const emails = multi(l.email).map((p) => ({ type: "work", value: p.value.toLowerCase() }));
    const ownerId = userFor(l.assigned_by_name);
    const id = randomUUID().replace(/-/g, "").slice(0, 25);
    const statusId = statusFor.get(l.status_name) ?? fallbackStatus;
    idFor.set(bx, { id, ownerId, closed: statuses.find((s) => s.id === statusId)?.kind !== "open" });
    const created = when(l.date_create) ?? new Date();
    const notes = [clean(l.comments), l.source_description && clean(l.source_description), !ownerId && l.assigned_by_name ? `Bitrix owner: ${l.assigned_by_name}` : ""].filter(Boolean).join("\n\n");
    leadRows.push({
      id, bitrixId: bx, number: bx, name: (l.full_name || l.title || "Unknown").trim().slice(0, 190) || "Unknown",
      phone: phones[0]?.value ?? null, phoneKey: phoneKey(phones[0]?.value), phone2: phones[1]?.value ?? null, email: emails[0]?.value ?? null,
      phones: phones.length ? JSON.stringify(phones) : null, emails: emails.length ? JSON.stringify(emails) : null,
      sourceId: sourceFor.get(l.source_name) ?? null, campaign: (l.utm_campaign || "").slice(0, 190) || null,
      sourceInfo: clean(l.source_description).slice(0, 2000) || null, notes: notes.slice(0, 8000) || null,
      statusId, ownerId, createdById: userFor(l.created_by?.replace(/^\[\d+\]\s*/, "")) ?? opts.userId,
      branchId: ownerId ? branchOf.get(ownerId) ?? null : null,
      createdAt: created, assignedAt: created, statusChangedAt: when(l.moved_time) ?? created, lastActivityAt: when(l.date_modify) ?? created,
      convertedAt: l.status_semantic_id === "S" ? when(l.date_closed) ?? when(l.moved_time) : null,
    });
  }
  for (let i = 0; i < leadRows.length; i += 300) await db.lead.createMany({ data: leadRows.slice(i, i + 300) });
  // Lead numbers carry on after the highest Bitrix ID.
  const seq = await db.sequence.findUnique({ where: { name: "lead" } });
  if (!seq || seq.value < maxNo) await db.sequence.upsert({ where: { name: "lead" }, update: { value: maxNo }, create: { name: "lead", value: maxNo } });

  // Activities: to-dos and tasks become tasks (done or still open), calls become calls. Same activity id once.
  const seen = new Set<string>();
  const acts = [];
  for (const a of f.activities) {
    const lead = idFor.get(Number(a.lead_id || a.owner_id));
    if (!lead || seen.has(a.id)) continue;
    seen.add(a.id);
    const isCall = a.provider_type_id === "CALL" || a.type_name === "Call";
    const start = when(a.start_time), end = when(a.end_time);
    const secs = isCall && start && end ? Math.max(0, Math.round((+end - +start) / 1000)) : 0;
    const ownerId = userFor(a.responsible_name) ?? lead.ownerId;
    // To-dos still open in Bitrix on leads that are already closed (Not Interested, junk…) are closed too, so they don't flood Overdue.
    const autoClosed = a.completed !== "Y" && lead.closed;
    const done = a.completed === "Y" || autoClosed;
    const body = clean(a.description);
    acts.push({
      leadId: lead.id, type: isCall ? "call" : "task",
      subject: (a.subject || (isCall ? "Call" : "Task")).slice(0, 190),
      body: [body, isCall && secs ? `Duration ${Math.floor(secs / 60)}m ${secs % 60}s` : "", a.status_name === "Completed automatically" ? "Closed automatically in Bitrix" : "", autoClosed ? "Closed on import (the lead was already closed)" : ""].filter(Boolean).join("\n").slice(0, 8000) || null,
      dueAt: isCall ? null : when(a.deadline), doneAt: done ? (isCall ? end ?? start : when(a.date_modify) ?? when(a.date_create)) : null,
      ownerId, createdById: userFor(a.author_name) ?? ownerId, branchId: ownerId ? branchOf.get(ownerId) ?? null : null,
      createdAt: when(a.date_create) ?? new Date(),
    });
  }
  for (let i = 0; i < acts.length; i += 500) await db.activity.createMany({ data: acts.slice(i, i + 500) });

  // Stage history → timeline entries "Status: A → B" at the time it happened.
  const byLead = new Map<number, Row[]>();
  for (const h of f.history) { const n = Number(h.lead_id); if (idFor.has(n)) byLead.set(n, [...(byLead.get(n) ?? []), h]); }
  const hist = [];
  for (const [n, rows] of byLead) {
    rows.sort((a, b) => (a.date_create ?? "").localeCompare(b.date_create ?? ""));
    let prev = "";
    for (const h of rows) {
      const name = STAGE_MAP[h.status_name] ?? h.status_name;
      if (!name || name === prev) continue;
      const by = userFor(h.assigned_by_name);
      hist.push({ leadId: idFor.get(n)!.id, type: "system", subject: prev ? `Status: ${prev} → ${name}` : `Lead created in Bitrix (${name})`, doneAt: when(h.date_create) ?? new Date(), createdAt: when(h.date_create) ?? new Date(), createdById: by, ownerId: by });
      prev = name;
    }
  }
  for (let i = 0; i < hist.length; i += 500) await db.activity.createMany({ data: hist.slice(i, i + 500) });
  return { deleted, leads: leadRows.length, skipped, activities: acts.length, history: hist.length, seconds: Math.round((Date.now() - t0) / 1000) };
}
