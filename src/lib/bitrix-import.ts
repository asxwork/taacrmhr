// Import from Bitrix24: leads, their activities (to-dos, tasks, calls) and stage history, from the CSV reports
// exported out of Bitrix (SQL lab). Files are recognised by their columns, so all of them can be dropped at once.
// Leads already imported (same Bitrix ID) are skipped, so running it twice is safe.
import { randomUUID } from "node:crypto";
import Papa from "papaparse";
import { db } from "./db";
import { BITRIX_STAGE_COLORS, phoneKey } from "./crm-shared";
import { hashPassword } from "./auth";
import { restartHoldClock } from "./lead-hold-core";

type Row = Record<string, string>;
export type BitrixFiles = { leads: Row[]; activities: Row[]; history: Row[]; comments: Row[]; ignored: string[] };

export function readBitrixFiles(files: { name: string; text: string }[]): BitrixFiles {
  const out: BitrixFiles = { leads: [], activities: [], history: [], comments: [], ignored: [] };
  for (const f of files) {
    const rows = Papa.parse<Row>(f.text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
    const cols = new Set(Object.keys(rows[0] ?? {}));
    if (cols.has("full_name") && cols.has("status_name") && cols.has("assigned_by_name")) out.leads.push(...rows);
    else if (cols.has("provider_id") && cols.has("lead_id")) out.activities.push(...rows);
    else if (cols.has("lead_id") && cols.has("status_name") && cols.has("assigned_by_name")) out.history.push(...rows);
    // Timeline comments, if a report has them: lead_id (or entity_id), comment, and when.
    else if (cols.has("comment") && (cols.has("lead_id") || cols.has("entity_id"))) out.comments.push(...rows.map((r) => ({ ...r, lead_id: r.lead_id || r.entity_id || "", date_create: r.date_create || r.created || "" })));
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

/** Short text columns hold 191 characters on MySQL; a longer value made the whole batch fail. */
const cap = (v: string | null | undefined, n = 190) => (v ? v.slice(0, n) : null);

/**
 * Saves rows in batches; if a batch is refused, saves that batch one row at a time so one bad row never stops the
 * rest. Returns the rows that still failed, with the database's reason.
 */
export async function saveAll<T>(rows: T[], size: number, many: (part: T[]) => Promise<unknown>, one: (row: T) => Promise<unknown>, label: (row: T) => string) {
  const failed: { what: string; why: string }[] = [];
  let saved = 0;
  for (let i = 0; i < rows.length; i += size) {
    const part = rows.slice(i, i + size);
    try { await many(part); saved += part.length; continue; } catch { /* fall back to one by one */ }
    for (const r of part) {
      try { await one(r); saved++; } catch (e) { failed.push({ what: label(r), why: (e instanceof Error ? e.message : String(e)).split("\n").filter(Boolean).pop()?.slice(0, 160) ?? "error" }); }
    }
  }
  return { saved, failed };
}

const STAGE_MAP: Record<string, string> = { Appointment: "Site Visit", "Good lead": "Complete lead" };
/** A Bitrix stage code with no name (UC_QS19PL): a stage deleted in Bitrix that only old history still mentions. */
const RAW_STAGE = /^UC_[A-Z0-9]+$/i;

/**
 * Removes stages made from those codes by earlier imports: empty ones are deleted; any that still hold leads are
 * renamed "Old Bitrix stage" and moved to the end. Runs after imports and at most hourly on the leads page.
 */
export async function cleanupRawStages() {
  const raw = (await db.leadStatus.findMany({ where: { name: { startsWith: "UC_" } }, select: { id: true, name: true, _count: { select: { leads: true } } } })).filter((s) => RAW_STAGE.test(s.name));
  if (!raw.length) return 0;
  const empty = raw.filter((s) => s._count.leads === 0).map((s) => s.id);
  if (empty.length) await db.leadStatus.deleteMany({ where: { id: { in: empty } } });
  let n = 0;
  for (const s of raw.filter((x) => x._count.leads > 0)) {
    n++;
    await db.leadStatus.update({ where: { id: s.id }, data: { name: `Old Bitrix stage ${n > 1 ? n : ""}`.trim(), sortOrder: 900 + n, color: "slate" } }).catch(() => {});
  }
  return raw.length;
}
const gc = globalThis as unknown as { __rawStageCheck?: number };
export function maybeCleanupRawStages() {
  if (Date.now() - (gc.__rawStageCheck ?? 0) < 3600_000) return;
  gc.__rawStageCheck = Date.now();
  cleanupRawStages().catch(() => {});
}
const JUNK = new Set(["Not Interested", "Not Valid", "Junk Lead"]);

/** Names compared loosely: case, extra spaces and dots don't matter. */
const nameKey = (s: string) => s.trim().toLowerCase().replace(/[.\s]+/g, " ").trim();
/**
 * The AMS person for a Bitrix name: exact match on a login's name or an employee's name first, then a unique
 * "starts with" match word by word ("Asadullah C" → "Asadullah Chaudhry", "Huzaifa" → "Huzaifa Khan").
 */
function ownerMatcher(people: { userId: string; name: string }[]) {
  const words = (s: string) => nameKey(s).split(" ").filter(Boolean);
  return (bitrixName: string): string | null => {
    const k = nameKey(bitrixName);
    if (!k) return null;
    const exact = [...new Set(people.filter((p) => nameKey(p.name) === k).map((p) => p.userId))];
    if (exact.length === 1) return exact[0]!;
    const want = words(bitrixName);
    const loose = [...new Set(people.filter((p) => { const have = words(p.name); return want.length <= have.length && want.every((w, i) => have[i]!.startsWith(w)); }).map((p) => p.userId))];
    return loose.length === 1 ? loose[0]! : null;
  };
}
/** AMS logins (and their employee names). Old employees (inactive logins) are matched only when no active one fits. */
async function amsPeople() {
  const [users, employees] = await Promise.all([
    db.user.findMany({ select: { id: true, name: true, active: true } }),
    db.employee.findMany({ where: { userId: { not: null } }, select: { fullName: true, userId: true, user: { select: { active: true } } } }),
  ]);
  const all = [...users.map((u) => ({ userId: u.id, name: u.name, active: u.active })), ...employees.map((e) => ({ userId: e.userId!, name: e.fullName, active: !!e.user?.active }))];
  return { users, people: all.filter((p) => p.active), oldPeople: all.filter((p) => !p.active) };
}
/** Active people first, then old employees. */
function peopleMatcher(p: { people: { userId: string; name: string }[]; oldPeople: { userId: string; name: string }[] }) {
  const active = ownerMatcher(p.people), old = ownerMatcher(p.oldPeople);
  return (name: string) => active(name) ?? old(name);
}
/** Picker value: make an inactive "old employee" login for this Bitrix name. */
export const NEW_OLD_EMPLOYEE = "__old";
/** The project column, if the export has one (Bitrix custom fields look like uf_crm_1700000000 / "Project"). */
const projectColumn = (rows: Row[]) => Object.keys(rows[0] ?? {}).find((k) => /project/i.test(k));
/** Bitrix list values come as "[12] Askari VI". */
const listValue = (v: string | undefined) => (v ?? "").replace(/^\s*\[\d+\]\s*/, "").trim();

/** What the import will do, before doing it. */
export async function analyzeBitrix(f: BitrixFiles) {
  const [team, statuses, sources, demo, already, projects] = await Promise.all([
    amsPeople(),
    db.leadStatus.findMany({ select: { id: true, name: true } }),
    db.leadSource.findMany({ select: { id: true, name: true } }),
    db.lead.count({ where: { bitrixId: null } }),
    db.lead.count({ where: { bitrixId: { in: f.leads.map((l) => Number(l.id)).filter(Boolean) } } }),
    db.project.findMany({ select: { name: true } }),
  ]);
  const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const { users } = team;
  const userFor = peopleMatcher(team);
  const count = (rows: Row[], k: string) => { const m = new Map<string, number>(); for (const r of rows) m.set(r[k] ?? "", (m.get(r[k] ?? "") ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const owners = count(f.leads, "assigned_by_name").map(([name, n]) => ({ name, n, userId: name === "The Advisor Associates" ? "admin" : userFor(name) }));
  const pcol = projectColumn(f.leads);
  const projectNames = pcol ? count(f.leads.map((l) => ({ p: listValue(l[pcol]) })), "p").filter(([p]) => p).map(([name, n]) => ({ name, n, inList: projects.some((x) => key(x.name) === key(name)) })) : [];
  const stageName = (s: string) => STAGE_MAP[s] ?? s;
  const stages = count(f.leads, "status_name").filter(([s]) => s).map(([name, n]) => ({ name, n, as: stageName(name), exists: statuses.some((x) => key(x.name) === key(stageName(name))) }));
  const srcs = count(f.leads, "source_name").filter(([s]) => s).map(([name, n]) => ({ name, n, exists: sources.some((x) => key(x.name) === key(name)) }));
  const actIds = new Set(f.activities.map((a) => a.id));
  return { leads: f.leads.length, activities: actIds.size, history: f.history.length, comments: f.comments.length, ignored: f.ignored, owners, people: users.map((u) => ({ id: u.id, name: u.active ? u.name : `${u.name} (old employee)`, active: u.active })).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)), projectColumn: pcol ?? null, projects: projectNames, stages, sources: srcs, demo, already };
}

/**
 * Imports. deleteDemo removes every lead that didn't come from Bitrix first (with its activities). Agents are
 * matched by name to AMS logins; the Bitrix company account goes to the person importing.
 */
const g = globalThis as unknown as { __bitrixImporting?: boolean };

/** One import at a time: two at once (Import pressed twice, two tabs) both saw a lead as new and added it twice. */
/**
 * `update`: leads already in AMS take Bitrix's current stage, responsible person and details (the sync; Bitrix is
 * where the change was made). `sync`: don't restart the on-hold clock (it's for one-off imports of old leads).
 */
export type ImportOpts = { deleteDemo: boolean; userId: string; owners?: Record<string, string>; update?: boolean; sync?: boolean };
export async function importBitrix(f: BitrixFiles, opts: ImportOpts) {
  if (g.__bitrixImporting) throw new Error("An import is already running. Wait for it to finish, then check the result (running it again later is safe).");
  g.__bitrixImporting = true;
  try { return await runImport(f, opts); } finally { g.__bitrixImporting = false; }
}

async function runImport(f: BitrixFiles, opts: ImportOpts) {
  const t0 = Date.now();
  // Imported leads carry Bitrix's old dates: restart the on-hold clock so they aren't put on hold / handed over at once.
  if (!opts.sync) await restartHoldClock(db);
  let deleted = 0;
  if (opts.deleteDemo) deleted = (await db.lead.deleteMany({ where: { bitrixId: null } })).count;

  const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const [team, branchRows, projects] = await Promise.all([
    amsPeople(),
    db.user.findMany({ select: { id: true, branchId: true } }),
    db.project.findMany({ select: { id: true, name: true } }),
  ]);
  const branchOf = new Map(branchRows.map((u) => [u.id, u.branchId]));
  const match = peopleMatcher(team);
  const validIds = new Set(branchRows.map((u) => u.id));
  // "Add as old employee": an inactive login with the Bitrix name (no email goes out: .local address, random password).
  const made = new Map<string, string>();
  for (const [name, choice] of Object.entries(opts.owners ?? {})) {
    if (choice !== NEW_OLD_EMPLOYEE || !name.trim()) continue;
    const existing = match(name);
    if (existing) { made.set(name, existing); continue; }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "staff";
    const u = await db.user.create({ data: { name: name.trim().slice(0, 120), email: `${slug}.${randomUUID().slice(0, 6)}@old-staff.local`, passwordHash: await hashPassword(randomUUID()), active: false, title: "Old employee (from Bitrix)" } });
    made.set(name, u.id); validIds.add(u.id);
  }
  // The person chosen in the preview for a Bitrix name wins; then the name match.
  const userFor = (name: string | undefined) => {
    if (!name) return null;
    if (made.has(name)) return made.get(name)!;
    const chosen = opts.owners?.[name];
    if (chosen && validIds.has(chosen)) return chosen;
    if (name === "The Advisor Associates") return opts.userId;
    return match(name);
  };
  const pcol = projectColumn(f.leads);
  const projectFor = (raw: string | undefined) => {
    const name = listValue(raw);
    if (!name) return { projectId: null, projectName: null };
    const p = projects.find((x) => key(x.name) === key(name));
    return p ? { projectId: p.id, projectName: null } : { projectId: null, projectName: name.slice(0, 190) };
  };

  // Stages and sources: use the ones that exist (by name), create the rest.
  const statuses = await db.leadStatus.findMany();
  let order = Math.max(0, ...statuses.map((s) => s.sortOrder));
  const statusFor = new Map<string, string>();
  // Stages of leads always; stages only old history mentions, not when they're bare codes of deleted Bitrix stages.
  for (const name of new Set(f.leads.map((l) => l.status_name).concat(f.history.map((h) => h.status_name).filter((n) => !RAW_STAGE.test(n ?? ""))).filter(Boolean))) {
    const want = STAGE_MAP[name] ?? name;
    let s = statuses.find((x) => key(x.name) === key(want));
    if (!s) {
      const semantic = f.leads.find((l) => l.status_name === name)?.status_semantic_id;
      s = await db.leadStatus.create({ data: { name: want, kind: JUNK.has(want) || semantic === "F" ? "junk" : semantic === "S" ? "converted" : "open", sortOrder: ++order, color: BITRIX_STAGE_COLORS[want.trim().toLowerCase()] ?? (JUNK.has(want) || semantic === "F" ? "red" : "blue") } });
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
  // Leads imported on an earlier run keep their place: they are not added again, but their activities and stage
  // history still come in (an earlier run that stopped half way left them without a timeline).
  const already = await db.lead.findMany({ where: { bitrixId: { not: null } }, select: { id: true, bitrixId: true, ownerId: true, status: { select: { kind: true } } } });
  const existing = new Set(already.map((l) => l.bitrixId));
  const idFor = new Map<number, { id: string; ownerId: string | null; closed: boolean }>(already.map((l) => [l.bitrixId!, { id: l.id, ownerId: l.ownerId, closed: l.status.kind !== "open" }]));
  const leadRows = [];
  const updates: Row[] = [];
  const unmatched = new Set<string>();
  let skipped = 0, maxNo = 0;
  for (const l of f.leads) {
    const bx = Number(l.id);
    if (!bx) continue;
    maxNo = Math.max(maxNo, bx);
    if (existing.has(bx)) { skipped++; if (opts.update) updates.push(l); continue; }
    const phones = multi(l.phone).map((p) => ({ type: p.type === "work" ? "work" : "mobile", value: prettyPhone(p.value) }));
    const emails = multi(l.email).map((p) => ({ type: "work", value: p.value.toLowerCase() }));
    const ownerId = userFor(l.assigned_by_name);
    if (!ownerId && l.assigned_by_name) unmatched.add(l.assigned_by_name);
    const id = randomUUID().replace(/-/g, "").slice(0, 25);
    const statusId = statusFor.get(l.status_name) ?? fallbackStatus;
    idFor.set(bx, { id, ownerId, closed: statuses.find((s) => s.id === statusId)?.kind !== "open" });
    const created = when(l.date_create) ?? new Date();
    // Notes are only what was written in Bitrix's comments (the form answers stay in Source information).
    const notes = clean(l.comments);
    leadRows.push({
      id, bitrixId: bx, number: bx, name: (l.full_name || l.title || "Unknown").trim().slice(0, 190) || "Unknown",
      phone: cap(phones[0]?.value), phoneKey: cap(phoneKey(phones[0]?.value)), phone2: cap(phones[1]?.value), email: cap(emails[0]?.value),
      phones: phones.length ? JSON.stringify(phones) : null, emails: emails.length ? JSON.stringify(emails) : null,
      ...projectFor(pcol ? l[pcol] : undefined),
      sourceId: sourceFor.get(l.source_name) ?? null, campaign: (l.utm_campaign || "").slice(0, 190) || null,
      sourceInfo: clean(l.source_description).slice(0, 2000) || null, notes: notes.slice(0, 8000) || null,
      statusId, ownerId, createdById: userFor(l.created_by?.replace(/^\[\d+\]\s*/, "")) ?? opts.userId,
      branchId: ownerId ? branchOf.get(ownerId) ?? null : null,
      createdAt: created, assignedAt: created, statusChangedAt: when(l.moved_time) ?? created, lastActivityAt: when(l.date_modify) ?? created,
      convertedAt: l.status_semantic_id === "S" ? when(l.date_closed) ?? when(l.moved_time) : null,
    });
  }
  const leadSave = await saveAll(leadRows, 300, (part) => db.lead.createMany({ data: part }), (row) => db.lead.create({ data: row }), (row) => `Lead ${row.bitrixId} (${row.name})`);
  // Leads that could not be saved don't get activities either.
  for (const f of leadSave.failed) { const n = Number(/Lead (\d+)/.exec(f.what)?.[1]); if (n) idFor.delete(n); }
  // Lead numbers carry on after the highest Bitrix ID.
  const seq = await db.sequence.findUnique({ where: { name: "lead" } });
  if (!seq || seq.value < maxNo) await db.sequence.upsert({ where: { name: "lead" }, update: { value: maxNo }, create: { name: "lead", value: maxNo } });

  // Sync: leads already in AMS take what changed in Bitrix (stage, responsible, contact details, project).
  let updated = 0;
  for (const l of updates) {
    const cur = idFor.get(Number(l.id));
    if (!cur) continue;
    const phones = multi(l.phone).map((p) => ({ type: p.type === "work" ? "work" : "mobile", value: prettyPhone(p.value) }));
    const emails = multi(l.email).map((p) => ({ type: "work", value: p.value.toLowerCase() }));
    const ownerId = userFor(l.assigned_by_name);
    if (!ownerId && l.assigned_by_name) unmatched.add(l.assigned_by_name);
    const statusId = statusFor.get(l.status_name);
    const row = await db.lead.findUnique({ where: { id: cur.id }, select: { statusId: true, ownerId: true } });
    if (!row) continue;
    const proj = pcol ? projectFor(l[pcol]) : null;
    try {
      await db.lead.update({ where: { id: cur.id }, data: {
        name: (l.full_name || l.title || "").trim().slice(0, 190) || undefined,
        ...(phones.length ? { phone: cap(phones[0]?.value), phoneKey: cap(phoneKey(phones[0]?.value)), phone2: cap(phones[1]?.value), phones: JSON.stringify(phones) } : {}),
        ...(emails.length ? { email: cap(emails[0]?.value), emails: JSON.stringify(emails) } : {}),
        ...(proj && (proj.projectId || proj.projectName) ? proj : {}),
        ...(l.source_description ? { sourceInfo: clean(l.source_description).slice(0, 2000) } : {}),
        ...(statusId && statusId !== row.statusId ? { statusId, statusChangedAt: when(l.moved_time) ?? new Date(), convertedAt: l.status_semantic_id === "S" ? when(l.date_closed) ?? new Date() : undefined } : {}),
        ...(ownerId && ownerId !== row.ownerId ? { ownerId, assignedAt: new Date(), branchId: branchOf.get(ownerId) ?? null } : {}),
        lastActivityAt: when(l.date_modify) ?? undefined,
      } });
      idFor.set(Number(l.id), { id: cur.id, ownerId: ownerId ?? row.ownerId, closed: statuses.find((s) => s.id === (statusId ?? row.statusId))?.kind !== "open" });
      if ((statusId && statusId !== row.statusId) || (ownerId && ownerId !== row.ownerId)) updated++; // stage or responsible changed
    } catch { /* one lead failing doesn't stop the sync */ }
  }

  // What is already on these leads' timelines (from an earlier run), so nothing comes in twice. Only the leads this
  // run touches are looked at (a sync touches a few).
  const have = new Set<string>();
  const sig = (leadId: string, subject: string, at: Date) => `${leadId}|${subject}|${+at}`;
  const touched = new Set([...f.leads.map((l) => Number(l.id)), ...f.activities.map((a) => Number(a.lead_id || a.owner_id)), ...f.history.map((h) => Number(h.lead_id)), ...f.comments.map((c) => Number(c.lead_id))]);
  const ids = already.filter((l) => touched.has(l.bitrixId!)).map((l) => l.id);
  for (let i = 0; i < ids.length; i += 1000) {
    for (const a of await db.activity.findMany({ where: { leadId: { in: ids.slice(i, i + 1000) } }, select: { leadId: true, subject: true, createdAt: true } })) if (a.leadId) have.add(sig(a.leadId, a.subject, a.createdAt));
  }

  let actNoLead = 0;
  // Activities: to-dos and tasks become tasks (done or still open), calls become calls. Same activity id once.
  const seen = new Set<string>();
  const acts = [];
  for (const a of f.activities) {
    const lead = idFor.get(Number(a.lead_id || a.owner_id));
    if (!lead) { actNoLead++; continue; }
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    const isCall = a.provider_type_id === "CALL" || a.type_name === "Call";
    const kind = isCall ? "call" : a.type_name === "Meeting" ? "meeting" : a.type_name === "E-mail" ? "note" : "task";
    const start = when(a.start_time), end = when(a.end_time);
    const secs = isCall && start && end ? Math.max(0, Math.round((+end - +start) / 1000)) : 0;
    const ownerId = userFor(a.responsible_name) ?? lead.ownerId;
    // To-dos still open in Bitrix on leads that are already closed (Not Interested, junk…) are closed too, so they don't flood Overdue.
    const autoClosed = a.completed !== "Y" && lead.closed;
    const done = a.completed === "Y" || autoClosed;
    const body = clean(a.description);
    acts.push({
      leadId: lead.id, type: kind,
      subject: ((kind === "note" ? "E-mail: " : "") + (a.subject || (isCall ? "Call" : "Task"))).slice(0, 190),
      body: [body, isCall && secs ? `Duration ${Math.floor(secs / 60)}m ${secs % 60}s` : "", a.status_name === "Completed automatically" ? "Closed automatically in Bitrix" : "", autoClosed ? "Closed on import (the lead was already closed)" : ""].filter(Boolean).join("\n").slice(0, 8000) || null,
      dueAt: isCall ? null : when(a.deadline), doneAt: done ? (isCall ? end ?? start : when(a.date_modify) ?? when(a.date_create)) : null,
      ownerId, createdById: userFor(a.author_name) ?? ownerId, branchId: ownerId ? branchOf.get(ownerId) ?? null : null,
      createdAt: when(a.date_create) ?? new Date(),
    });
  }
  const newActs = acts.filter((a) => { const k = sig(a.leadId, a.subject, a.createdAt); if (have.has(k)) return false; have.add(k); return true; });
  const actSave = await saveAll(newActs, 500, (part) => db.activity.createMany({ data: part }), (row) => db.activity.create({ data: row }), (row) => `Activity "${row.subject}"`);

  // Stage history → timeline entries "Status: A → B" at the time it happened.
  const byLead = new Map<number, Row[]>();
  for (const h of f.history) { const n = Number(h.lead_id); if (idFor.has(n)) byLead.set(n, [...(byLead.get(n) ?? []), h]); }
  const hist = [];
  for (const [n, rows] of byLead) {
    rows.sort((a, b) => (a.date_create ?? "").localeCompare(b.date_create ?? ""));
    let prev = "";
    for (const h of rows) {
      const name = RAW_STAGE.test(h.status_name ?? "") ? "Old stage (deleted in Bitrix)" : STAGE_MAP[h.status_name] ?? h.status_name;
      if (!name || name === prev) continue;
      const by = userFor(h.assigned_by_name);
      hist.push({ leadId: idFor.get(n)!.id, type: "system", subject: prev ? `Status: ${prev} → ${name}` : `Lead created in Bitrix (${name})`, doneAt: when(h.date_create) ?? new Date(), createdAt: when(h.date_create) ?? new Date(), createdById: by, ownerId: by });
      prev = name;
    }
  }
  const newHist = hist.filter((a) => { const k = sig(a.leadId, a.subject, a.createdAt); if (have.has(k)) return false; have.add(k); return true; });
  const histSave = await saveAll(newHist, 500, (part) => db.activity.createMany({ data: part }), (row) => db.activity.create({ data: row }), (row) => `Stage change "${row.subject}"`);

  // Timeline comments → notes, written by the person who wrote them in Bitrix, at the time they wrote them.
  const notes = [];
  for (const c of f.comments) {
    const lead = idFor.get(Number(c.lead_id));
    const body = clean(c.comment);
    if (!lead || !body) continue;
    const by = userFor(c.author_name);
    const at = when(c.date_create) ?? new Date();
    notes.push({ leadId: lead.id, type: "note", subject: `Comment: ${body.split("\n")[0]!.slice(0, 120)}`.slice(0, 190), body: body.slice(0, 8000), doneAt: at, createdAt: at, createdById: by ?? lead.ownerId, ownerId: by ?? lead.ownerId, branchId: (by ?? lead.ownerId) ? branchOf.get((by ?? lead.ownerId)!) ?? null : null });
  }
  const newNotes = notes.filter((a) => { const k = sig(a.leadId, a.subject, a.createdAt); if (have.has(k)) return false; have.add(k); return true; });
  const noteSave = await saveAll(newNotes, 500, (part) => db.activity.createMany({ data: part }), (row) => db.activity.create({ data: row }), (row) => `Comment "${row.subject}"`);
  await cleanupRawStages().catch(() => {});
  const failed = [...leadSave.failed, ...actSave.failed, ...histSave.failed, ...noteSave.failed];
  // What happened to every activity in the file (shown on the result screen).
  const activityReport = { inFile: f.activities.length, noLead: actNoLead, alreadyThere: acts.length - newActs.length, saved: actSave.saved, failed: actSave.failed.length };
  const commentReport = { inFile: f.comments.length, saved: noteSave.saved, alreadyThere: notes.length - newNotes.length };
  const historyReport = { inFile: f.history.length, saved: histSave.saved, alreadyThere: hist.length - newHist.length };
  return { updated, unmatched: [...unmatched], activityReport, historyReport, commentReport, comments: noteSave.saved, deleted, leads: leadSave.saved, skipped, activities: actSave.saved, history: histSave.saved, failed: failed.length, failedList: failed.slice(0, 20), seconds: Math.round((Date.now() - t0) / 1000) };
}
