// Full lead export/import as an Excel workbook: a "Leads" sheet (every field) and an "Activities" sheet
// (every call, note, task and system entry, linked by lead ID). The same file imports back:
// existing IDs are updated, new IDs are created (keeping their number), activities already present are skipped.
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { phoneKey } from "./crm-shared";
import { restartHoldClock } from "./lead-hold-core";
import { unitLabel } from "./inventory";

const LEAD_COLUMNS = [
  "ID", "Name", "Phones", "Emails", "Stage", "Source", "Source information", "Campaign", "Project", "Property",
  "Interest", "Property type", "Preferred location", "Budget from", "Budget to", "Responsible email", "Responsible",
  "Branch", "Notes", "Created", "Modified", "Last activity", "Reshuffled",
] as const;
const ACTIVITY_COLUMNS = ["Lead ID", "Type", "Subject", "Details", "Due", "Done", "Responsible email", "Created by email", "Created"] as const;

type Entry = { type: string; value: string };
const parseList = (json: string | null, fallback: (string | null)[], type: string): Entry[] => {
  if (json) { try { const v = JSON.parse(json) as Entry[]; if (Array.isArray(v) && v.length) return v; } catch {} }
  return fallback.filter((x): x is string => !!x).map((value) => ({ type, value }));
};
const listText = (l: Entry[]) => l.map((e) => `${e.type}: ${e.value}`).join("; ");
const textList = (s: string, type: string): Entry[] =>
  s.split(/[;\n]/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^([A-Za-z ]{2,20}):\s*(.+)$/);
    return m ? { type: m[1]!.trim(), value: m[2]!.trim() } : { type, value: p };
  });

export async function exportLeadsWorkbook(where: Prisma.LeadWhereInput) {
  const leads = await db.lead.findMany({
    where,
    include: {
      status: true, source: true, project: true, owner: true, branch: true,
      unit: { include: { project: { select: { name: true } }, block: { select: { name: true } } } },
      activities: { include: { owner: { select: { email: true } }, createdBy: { select: { email: true } } }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { number: "asc" },
    take: 20000,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "The Advisor Associates";
  const ls = wb.addWorksheet("Leads", { views: [{ state: "frozen", ySplit: 1 }] });
  ls.columns = LEAD_COLUMNS.map((h) => ({ header: h, key: h, width: ["Name", "Source information", "Notes", "Phones", "Emails", "Property"].includes(h) ? 32 : 16 }));
  const as = wb.addWorksheet("Activities", { views: [{ state: "frozen", ySplit: 1 }] });
  as.columns = ACTIVITY_COLUMNS.map((h) => ({ header: h, key: h, width: ["Subject", "Details"].includes(h) ? 40 : 18 }));

  for (const l of leads) {
    ls.addRow({
      ID: l.number, Name: l.name,
      Phones: listText(parseList(l.phones, [l.phone, l.phone2], "Mobile")), Emails: listText(parseList(l.emails, [l.email], "Work")),
      Stage: l.status.name, Source: l.source?.name, "Source information": l.sourceInfo, Campaign: l.campaign, Project: l.project?.name,
      Property: l.unit ? unitLabel(l.unit) : null, Interest: l.interest, "Property type": l.propertyType, "Preferred location": l.location,
      "Budget from": l.budgetMin, "Budget to": l.budgetMax, "Responsible email": l.owner?.email, Responsible: l.owner?.name,
      Branch: l.branch?.name, Notes: l.notes, Created: l.createdAt, Modified: l.updatedAt, "Last activity": l.lastActivityAt,
      Reshuffled: l.reshuffledAt ? `Yes (${l.reshuffleCount}×)` : "",
    });
    for (const a of l.activities) {
      as.addRow({
        "Lead ID": l.number, Type: a.type, Subject: a.subject, Details: a.body, Due: a.dueAt, Done: a.doneAt,
        "Responsible email": a.owner?.email, "Created by email": a.createdBy?.email, Created: a.createdAt,
      });
    }
  }
  for (const s of [ls, as]) {
    s.getRow(1).font = { bold: true };
    s.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F6" } };
    s.columns.forEach((c) => { if (["Created", "Modified", "Last activity", "Due", "Done"].includes(String(c.key))) c.numFmt = "yyyy-mm-dd hh:mm"; });
  }
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), leads: leads.length };
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("hyperlink" in v) return String(v.hyperlink);
  }
  return String(v).trim();
};
const cellDate = (v: ExcelJS.CellValue) => {
  if (v instanceof Date) return v;
  const s = cellText(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(+d) ? null : d;
};
const cellNum = (v: ExcelJS.CellValue) => {
  const n = typeof v === "number" ? v : parseFloat(cellText(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

function readSheet(ws: ExcelJS.Worksheet | undefined) {
  if (!ws) return [];
  const headers: string[] = [];
  ws.getRow(1).eachCell((c, i) => { headers[i] = cellText(c.value).toLowerCase(); });
  const rows: Record<string, ExcelJS.CellValue>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const r: Record<string, ExcelJS.CellValue> = {};
    row.eachCell({ includeEmpty: false }, (c, i) => { if (headers[i]) r[headers[i]!] = c.value; });
    if (Object.keys(r).length) rows.push(r);
  });
  return rows;
}

/** Imports a workbook made by exportLeadsWorkbook (or edited from one). Returns a summary. */
export async function importLeadsWorkbook(data: ArrayBuffer, actorId: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const leadRows = readSheet(wb.getWorksheet("Leads") ?? wb.worksheets[0]).slice(0, 50000);
  await restartHoldClock(db); // restored leads keep their dates: don't let the on-hold rules act on them at once
  const actRows = readSheet(wb.getWorksheet("Activities")).slice(0, 100000);
  if (!leadRows.length) return { error: "No leads found. Use a file exported from here (sheet “Leads”)." };

  const [statuses, sources, projects, users, branches, units] = await Promise.all([
    db.leadStatus.findMany(), db.leadSource.findMany(), db.project.findMany({ select: { id: true, name: true } }),
    db.user.findMany({ select: { id: true, email: true, name: true, branchId: true } }), db.branch.findMany(),
    db.unit.findMany({ include: { project: { select: { name: true } }, block: { select: { name: true } } } }),
  ]);
  const byName = <T extends { name: string }>(list: T[], n: string) => list.find((x) => x.name.toLowerCase() === n.toLowerCase());
  const userBy = (email: string, name?: string) => users.find((u) => email && u.email.toLowerCase() === email.toLowerCase()) ?? (name ? byName(users, name) : undefined);
  const unitByLabel = new Map(units.map((u) => [unitLabel(u).toLowerCase(), u.id]));
  const firstOpen = statuses.filter((s) => s.kind === "open").sort((a, b) => a.sortOrder - b.sortOrder)[0];

  // Leads already in AMS, by their number: one query per 1,000 numbers instead of one per row.
  const nums = [...new Set(leadRows.map((r) => cellNum(r["id"] ?? null)).filter((n): n is number => !!n).map(Math.round))];
  const existingBy = new Map<number, { id: string; statusId: string }>();
  for (let i = 0; i < nums.length; i += 1000) {
    for (const l of await db.lead.findMany({ where: { number: { in: nums.slice(i, i + 1000) } }, select: { id: true, number: true, statusId: true } })) if (l.number != null) existingBy.set(l.number, l);
  }

  let created = 0, updated = 0, acts = 0;
  const leadIdByNumber = new Map<number, string>();
  const toCreate: Prisma.LeadCreateManyInput[] = [];
  const toUpdate: { id: string; data: Prisma.LeadUncheckedUpdateInput }[] = [];
  const unnumbered: Prisma.LeadCreateManyInput[] = [];
  let maxNo = 0;
  for (const r of leadRows) {
    const g = (k: string) => cellText(r[k.toLowerCase()] ?? null);
    const phones = textList(g("Phones"), "Mobile");
    const emails = textList(g("Emails"), "Work");
    // Every row with a name, phone or email comes in (a nameless row is named "No name").
    const name = g("Name") || (phones.length || emails.length ? "No name" : "");
    if (!name) continue;
    let sourceId: string | null = null;
    if (g("Source")) {
      let source = byName(sources, g("Source"));
      if (!source) {
        source = await db.leadSource.create({ data: { name: g("Source"), sortOrder: 99 } });
        sources.push(source);
      }
      sourceId = source.id;
    }
    const owner = userBy(g("Responsible email"), g("Responsible"));
    const status = byName(statuses, g("Stage")) ?? firstOpen!;
    const data = {
      name, phone: phones[0]?.value ?? null, phone2: phones[1]?.value ?? null, phoneKey: phoneKey(phones[0]?.value), email: emails[0]?.value.toLowerCase() ?? null,
      phones: phones.length ? JSON.stringify(phones) : null, emails: emails.length ? JSON.stringify(emails) : null,
      statusId: status.id, sourceId, sourceInfo: g("Source information") || null, campaign: g("Campaign") || null,
      projectId: byName(projects, g("Project"))?.id ?? null, unitId: unitByLabel.get(g("Property").toLowerCase()) ?? null,
      interest: g("Interest") || null, propertyType: g("Property type") || null, location: g("Preferred location") || null,
      budgetMin: cellNum(r["budget from"] ?? null), budgetMax: cellNum(r["budget to"] ?? null), notes: g("Notes") || null,
      ownerId: owner?.id ?? null, branchId: byName(branches, g("Branch"))?.id ?? owner?.branchId ?? null,
    };
    const num = cellNum(r["id"] ?? null);
    const number = num ? Math.round(num) : null;
    const existing = number ? existingBy.get(number) : undefined;
    // On-hold is only set by the system: a file can keep a lead on hold, never put one there.
    if (status.systemKey === "onhold" && existing?.statusId !== status.id) data.statusId = existing?.statusId ?? firstOpen!.id;
    if (existing) {
      toUpdate.push({ id: existing.id, data });
      leadIdByNumber.set(number!, existing.id);
      updated++;
    } else {
      const now = new Date();
      const row: Prisma.LeadCreateManyInput = { ...data, id: randomUUID().replace(/-/g, "").slice(0, 25), createdById: actorId, createdAt: cellDate(r["created"] ?? null) ?? now, lastActivityAt: cellDate(r["last activity"] ?? null), assignedAt: now, statusChangedAt: now };
      if (number) {
        if (leadIdByNumber.has(number)) continue; // the same ID twice in the file: keep the first
        row.number = number; maxNo = Math.max(maxNo, number);
        leadIdByNumber.set(number, row.id!);
        existingBy.set(number, { id: row.id!, statusId: data.statusId });
        toCreate.push(row);
      } else unnumbered.push(row);
      created++;
    }
  }
  // Rows without an ID get the next numbers in one step; the counter always ends above every imported number.
  const seq = await db.sequence.findUnique({ where: { name: "lead" } });
  let next = Math.max(seq?.value ?? 0, maxNo);
  for (const row of unnumbered) row.number = ++next;
  if (!seq || seq.value < next) await db.sequence.upsert({ where: { name: "lead" }, update: { value: next }, create: { name: "lead", value: next } });
  const allNew = [...toCreate, ...unnumbered];
  for (let i = 0; i < allNew.length; i += 500) await db.lead.createMany({ data: allNew.slice(i, i + 500) });
  // Updates: ten at a time side by side.
  for (let i = 0; i < toUpdate.length; i += 10) await Promise.all(toUpdate.slice(i, i + 10).map((u) => db.lead.update({ where: { id: u.id }, data: u.data })));

  // Activities: skip ones already there (same lead, type, subject and time), then save in batches.
  const leadIds = [...new Set(leadIdByNumber.values())];
  const have = new Set<string>();
  const sig = (leadId: string, type: string, subject: string, at: Date) => `${leadId}|${type}|${subject}|${+at}`;
  for (let i = 0; i < leadIds.length; i += 1000) {
    for (const a of await db.activity.findMany({ where: { leadId: { in: leadIds.slice(i, i + 1000) } }, select: { leadId: true, type: true, subject: true, createdAt: true } })) if (a.leadId) have.add(sig(a.leadId, a.type, a.subject, a.createdAt));
  }
  const newActs: Prisma.ActivityCreateManyInput[] = [];
  for (const r of actRows) {
    const num = cellNum(r["lead id"] ?? null);
    const leadId = num ? leadIdByNumber.get(Math.round(num)) : undefined;
    const subject = cellText(r["subject"] ?? null);
    if (!leadId || !subject) continue;
    const createdAt = cellDate(r["created"] ?? null) ?? new Date();
    const type = cellText(r["type"] ?? null) || "note";
    const k = sig(leadId, type, subject, createdAt);
    if (have.has(k)) continue;
    have.add(k);
    const owner = userBy(cellText(r["responsible email"] ?? null));
    const creator = userBy(cellText(r["created by email"] ?? null));
    newActs.push({
      leadId, type, subject, body: cellText(r["details"] ?? null) || null, dueAt: cellDate(r["due"] ?? null), doneAt: cellDate(r["done"] ?? null),
      ownerId: owner?.id ?? null, createdById: creator?.id ?? actorId, createdAt, branchId: owner?.branchId ?? null,
    });
  }
  for (let i = 0; i < newActs.length; i += 500) await db.activity.createMany({ data: newActs.slice(i, i + 500) });
  acts = newActs.length;
  return { created, updated, activities: acts };
}
