// Developer resources (Settings → Developer resources): the methods an inbound webhook link or an AI assistant (MCP)
// can call. Every call runs with the permissions of the person who made the link, limited to the link's scopes —
// a link never reaches more than that person could see or change in AMS.
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { loadUserById, type SessionUser } from "./auth";
import { can, scopeWhere } from "./permissions";
import { leadChangeWhere } from "./lead-lock";

export const DEV_SCOPES = [
  { key: "crm", label: "CRM", about: "Leads, their activities and comments, deals, stages and sources" },
  { key: "users", label: "Users", about: "Who you are and the list of colleagues" },
  { key: "hr", label: "HR", about: "Employee list (names, departments, designations; never salaries or CNICs)" },
  { key: "mcp", label: "AI assistant (MCP)", about: "Lets an AI assistant like Claude use this key through the MCP server" },
] as const;
export type DevScope = (typeof DEV_SCOPES)[number]["key"];

export const DEV_EVENTS = [
  { key: "lead.created", label: "Lead added" },
  { key: "lead.updated", label: "Lead changed (stage, responsible, details)" },
  { key: "activity.created", label: "Activity or comment added" },
  { key: "deal.created", label: "Deal added" },
  { key: "deal.updated", label: "Deal changed" },
] as const;

export const newToken = () => `ams_${randomBytes(20).toString("hex")}`;
export const hashToken = (t: string) => createHash("sha256").update(t.trim()).digest("hex");

type Param = { name: string; type: "string" | "number" | "boolean"; about: string; required?: boolean };
type Ctx = { user: SessionUser; p: Record<string, unknown> };
export type DevMethod = { name: string; scope: DevScope; about: string; params: Param[]; write?: boolean; run: (c: Ctx) => Promise<unknown> };

class ApiError extends Error { constructor(public code: string, message: string) { super(message); } }
export { ApiError };
const need = (ok: boolean, msg = "Your account isn't allowed to do this in AMS.") => { if (!ok) throw new ApiError("ACCESS_DENIED", msg); };
const str = (v: unknown) => (v == null ? "" : String(v).trim());
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && str(v) !== "" ? Number(v) : d);
const page = (p: Record<string, unknown>) => ({ skip: Math.max(0, num(p.start, 0)), take: Math.min(50, Math.max(1, num(p.limit, 50))) });

const LEAD_SELECT = {
  id: true, number: true, name: true, phone: true, phone2: true, email: true, campaign: true, sourceInfo: true, notes: true,
  location: true, interest: true, budgetMax: true, projectName: true, createdAt: true, updatedAt: true, statusChangedAt: true,
  status: { select: { id: true, name: true, kind: true } }, source: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true, email: true } }, project: { select: { id: true, name: true } },
} satisfies Prisma.LeadSelect;
type LeadRow = Prisma.LeadGetPayload<{ select: typeof LEAD_SELECT }>;
const leadOut = (l: LeadRow) => ({
  id: l.id, number: l.number, name: l.name, phone: l.phone, phone2: l.phone2, email: l.email,
  stage: l.status.name, stage_id: l.status.id, closed: l.status.kind !== "open", source: l.source?.name ?? null,
  responsible: l.owner ? { id: l.owner.id, name: l.owner.name, email: l.owner.email } : null,
  project: l.project?.name ?? l.projectName ?? null, campaign: l.campaign, source_info: l.sourceInfo, notes: l.notes,
  location: l.location, interest: l.interest, budget: l.budgetMax, created_at: l.createdAt, updated_at: l.updatedAt, stage_changed_at: l.statusChangedAt,
});

async function findLead(user: SessionUser, p: Record<string, unknown>, action: "view" | "edit" = "view") {
  const id = str(p.id), number = num(p.number ?? (/^\d+$/.test(id) ? id : NaN), NaN);
  const scope = action === "edit" ? await leadChangeWhere(user) : ((await scopeWhere(user, "crm.leads")) as Prisma.LeadWhereInput | null);
  need(!!scope, "Your account can't see leads.");
  const lead = await db.lead.findFirst({ where: { AND: [scope!, Number.isFinite(number) ? { number } : { id }] }, select: LEAD_SELECT });
  if (!lead) throw new ApiError("NOT_FOUND", "No lead with that id or number (or you can't open it).");
  return lead;
}
const findUser = async (v: unknown) => {
  const s = str(v);
  if (!s) return null;
  const u = await db.user.findFirst({ where: { active: true, OR: [{ id: s }, { email: s.toLowerCase() }, { name: s }] }, select: { id: true, branchId: true } });
  if (!u) throw new ApiError("NOT_FOUND", `No active user "${s}".`);
  return u;
};

export const DEV_METHODS: DevMethod[] = [
  // ── CRM
  {
    name: "crm.lead.list", scope: "crm", about: "Leads you can see, newest first (50 per page; use start for the next page).",
    params: [
      { name: "q", type: "string", about: "Search name, phone or email" }, { name: "stage", type: "string", about: "Stage name or id" },
      { name: "responsible", type: "string", about: "User email, name or id" }, { name: "source", type: "string", about: "Source name" },
      { name: "created_from", type: "string", about: "Date, e.g. 2026-11-01" }, { name: "created_to", type: "string", about: "Date, e.g. 2026-11-30" },
      { name: "start", type: "number", about: "Skip this many (paging)" }, { name: "limit", type: "number", about: "Up to 50" },
    ],
    run: async ({ user, p }) => {
      need(can(user, "crm.leads"));
      const and: Prisma.LeadWhereInput[] = [(await scopeWhere(user, "crm.leads")) as Prisma.LeadWhereInput];
      const q = str(p.q);
      if (q) and.push({ OR: [{ name: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }, ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : [])] });
      if (str(p.stage)) and.push({ OR: [{ statusId: str(p.stage) }, { status: { name: str(p.stage) } }] });
      if (str(p.source)) and.push({ source: { name: str(p.source) } });
      if (str(p.responsible)) and.push({ ownerId: (await findUser(p.responsible))!.id });
      const from = str(p.created_from) ? new Date(str(p.created_from)) : null, to = str(p.created_to) ? new Date(`${str(p.created_to)}T23:59:59`) : null;
      if (from || to) and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
      const where = { AND: and }, { skip, take } = page(p);
      const [rows, total] = await Promise.all([db.lead.findMany({ where, select: LEAD_SELECT, orderBy: { createdAt: "desc" }, skip, take }), db.lead.count({ where })]);
      return { result: rows.map(leadOut), total, next: skip + take < total ? skip + take : undefined };
    },
  },
  {
    name: "crm.lead.get", scope: "crm", about: "One lead with its details.",
    params: [{ name: "id", type: "string", about: "Lead id or number (e.g. 9004)", required: true }],
    run: async ({ user, p }) => { need(can(user, "crm.leads")); return { result: leadOut(await findLead(user, p)) }; },
  },
  {
    name: "crm.lead.add", scope: "crm", write: true,
    about: "Adds a lead. Needs name and a phone or an email. A lead with the same phone or email that is still open isn't duplicated: the enquiry is added to it (status merged). Without responsible, it's shared out by rotation like website leads.",
    params: [
      { name: "name", type: "string", about: "Client name", required: true },
      { name: "phone", type: "string", about: "Phone in any format (+92 300 1234567, 0300…, +971…). Phone or email is required" },
      { name: "email", type: "string", about: "Email. Phone or email is required" },
      { name: "source", type: "string", about: "Source name as in CRM settings, e.g. Website, Facebook, Zameen (default Website)" },
      { name: "notes", type: "string", about: "What they asked; saved as the lead's notes (alias: message)" },
      { name: "campaign", type: "string", about: "Campaign name" },
      { name: "project", type: "string", about: "Project name; linked when it's in your Inventory projects" },
      { name: "location", type: "string", about: "Area / city" },
      { name: "budget", type: "string", about: "Budget, e.g. 2.5 crore, 25000000" },
      { name: "interest", type: "string", about: "buy, rent, invest or sell" },
      { name: "property_type", type: "string", about: "e.g. Apartment, Plot, House" },
      { name: "responsible", type: "string", about: "Give it to this person (email, name or user id) instead of rotation; the key's owner needs Leads → Reassign" },
    ],
    run: async ({ user, p }) => {
      need(can(user, "crm.leads", "create"));
      if (!str(p.name)) throw new ApiError("INVALID", "name is required.");
      if (!str(p.phone) && !str(p.email)) throw new ApiError("INVALID", "phone or email is required.");
      let assignee: { id: string; branchId: string | null } | null = null;
      if (str(p.responsible)) { need(can(user, "crm.leads", "assign"), "Your account can't choose who gets leads (Leads → Reassign); leave responsible out to use the rotation."); assignee = await findUser(p.responsible); }
      const { ingestLead, normalizeIncoming } = await import("./lead-intake");
      const input = normalizeIncoming({ ...p, message: p.notes ?? p.message });
      const r = await ingestLead(input, "api", { id: `dev:${user.id}`, name: "API", ...(assignee ? { assigneeIds: [assignee.id] } : {}) });
      if (r.status === "ignored") throw new ApiError("INVALID", "phone or email is required.");
      if (r.status === "created" && str(p.project)) {
        const pr = await db.project.findFirst({ where: { name: str(p.project) } });
        await db.lead.update({ where: { id: r.leadId }, data: pr ? { projectId: pr.id } : { projectName: str(p.project).slice(0, 190) } });
      }
      const lead = await db.lead.findUnique({ where: { id: r.leadId }, select: { id: true, number: true, owner: { select: { name: true } } } });
      return { result: { id: lead!.id, number: lead!.number, status: r.status, responsible: lead!.owner?.name ?? null } };
    },
  },
  {
    name: "crm.lead.update", scope: "crm", write: true, about: "Changes a lead: stage, responsible person, name, phone, email, project or notes.",
    params: [
      { name: "id", type: "string", about: "Lead id or number", required: true }, { name: "stage", type: "string", about: "New stage name or id" },
      { name: "responsible", type: "string", about: "New responsible: email, name or id" }, { name: "name", type: "string", about: "Client name" },
      { name: "phone", type: "string", about: "Phone" }, { name: "email", type: "string", about: "Email" },
      { name: "project", type: "string", about: "Project name" }, { name: "notes", type: "string", about: "Replace the notes" },
    ],
    run: async ({ user, p }) => {
      need(can(user, "crm.leads", "edit"));
      const lead = await findLead(user, p, "edit");
      const data: Prisma.LeadUncheckedUpdateInput = {};
      if (str(p.stage)) {
        const s = await db.leadStatus.findFirst({ where: { active: true, OR: [{ id: str(p.stage) }, { name: str(p.stage) }] } });
        if (!s) throw new ApiError("NOT_FOUND", `No stage "${str(p.stage)}".`);
        if (s.systemKey === "onhold") throw new ApiError("ACCESS_DENIED", "Only the system moves leads to On-hold.");
        if (s.id !== lead.status.id) Object.assign(data, { statusId: s.id, statusChangedAt: new Date() });
      }
      if (str(p.responsible)) { need(can(user, "crm.leads", "assign"), "Your account can't reassign leads."); const u = (await findUser(p.responsible))!; Object.assign(data, { ownerId: u.id, branchId: u.branchId, assignedAt: new Date() }); }
      if (str(p.name)) data.name = str(p.name).slice(0, 190);
      if (str(p.phone)) data.phone = str(p.phone).slice(0, 40);
      if (str(p.email)) data.email = str(p.email).toLowerCase().slice(0, 190);
      if (str(p.project)) { const pr = await db.project.findFirst({ where: { name: str(p.project) } }); Object.assign(data, pr ? { projectId: pr.id, projectName: null } : { projectName: str(p.project).slice(0, 190) }); }
      if (p.notes !== undefined) data.notes = str(p.notes).slice(0, 8000) || null;
      if (!Object.keys(data).length) throw new ApiError("INVALID", "Nothing to change: pass stage, responsible, name, phone, email, project or notes.");
      await db.lead.update({ where: { id: lead.id }, data });
      return { result: leadOut(await findLead(user, { id: lead.id })) };
    },
  },
  {
    name: "crm.activity.list", scope: "crm", about: "A lead's timeline: calls, tasks, meetings, comments and stage changes, newest first.",
    params: [{ name: "lead_id", type: "string", about: "Lead id or number", required: true }, { name: "start", type: "number", about: "Paging" }, { name: "limit", type: "number", about: "Up to 50" }],
    run: async ({ user, p }) => {
      need(can(user, "crm.leads"));
      const lead = await findLead(user, { id: p.lead_id });
      const { skip, take } = page(p);
      const rows = await db.activity.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "desc" }, skip, take, select: { id: true, type: true, subject: true, body: true, dueAt: true, doneAt: true, createdAt: true, owner: { select: { name: true } } } });
      return { result: rows.map((a) => ({ id: a.id, type: a.type, subject: a.subject, body: a.body, due_at: a.dueAt, done_at: a.doneAt, created_at: a.createdAt, responsible: a.owner?.name ?? null })) };
    },
  },
  {
    name: "crm.activity.add", scope: "crm", write: true, about: "Plans a follow-up (task, call, meeting, site visit) on a lead, or logs one as done.",
    params: [
      { name: "lead_id", type: "string", about: "Lead id or number", required: true }, { name: "type", type: "string", about: "task, call, meeting or visit (default task)" },
      { name: "subject", type: "string", about: "What to do, e.g. Call back with payment plan", required: true }, { name: "body", type: "string", about: "Details" },
      { name: "due", type: "string", about: "When, e.g. 2026-11-25T15:00 (Pakistan time)" }, { name: "done", type: "boolean", about: "true = already done" },
    ],
    run: async ({ user, p }) => {
      need(can(user, "crm.activities", "create") || can(user, "crm.leads", "edit"));
      const lead = await findLead(user, { id: p.lead_id });
      const type = ["task", "call", "meeting", "visit"].includes(str(p.type)) ? str(p.type) : "task";
      if (!str(p.subject)) throw new ApiError("INVALID", "subject is required.");
      const due = str(p.due) ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(str(p.due)) ? str(p.due) : `${str(p.due)}+05:00`) : null;
      const done = p.done === true || str(p.done) === "true";
      const a = await db.activity.create({ data: { leadId: lead.id, type, subject: str(p.subject).slice(0, 190), body: str(p.body).slice(0, 8000) || null, dueAt: due, doneAt: done ? new Date() : null, ownerId: lead.owner?.id ?? user.id, createdById: user.id, branchId: user.branchId } });
      await db.lead.update({ where: { id: lead.id }, data: { lastActivityAt: new Date() } });
      return { result: { id: a.id } };
    },
  },
  {
    name: "crm.comment.add", scope: "crm", write: true, about: "Adds a comment to a lead's timeline.",
    params: [{ name: "lead_id", type: "string", about: "Lead id or number", required: true }, { name: "text", type: "string", about: "The comment", required: true }],
    run: async ({ user, p }) => {
      need(can(user, "crm.leads"));
      const lead = await findLead(user, { id: p.lead_id });
      const text = str(p.text);
      if (!text) throw new ApiError("INVALID", "text is required.");
      const a = await db.activity.create({ data: { leadId: lead.id, type: "note", subject: `Comment: ${text.split("\n")[0]!.slice(0, 120)}`, body: text.slice(0, 8000), doneAt: new Date(), ownerId: user.id, createdById: user.id, branchId: user.branchId } });
      return { result: { id: a.id } };
    },
  },
  {
    name: "crm.status.list", scope: "crm", about: "Lead stages in order (kind: open, converted or junk).", params: [],
    run: async ({ user }) => { need(can(user, "crm.leads")); return { result: (await db.leadStatus.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, kind: true, color: true } })) }; },
  },
  {
    name: "crm.source.list", scope: "crm", about: "Lead sources.", params: [],
    run: async ({ user }) => { need(can(user, "crm.leads")); return { result: (await db.leadSource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } })) }; },
  },
  {
    name: "crm.deal.list", scope: "crm", about: "Deals you can see, newest first.",
    params: [{ name: "start", type: "number", about: "Paging" }, { name: "limit", type: "number", about: "Up to 50" }],
    run: async ({ user, p }) => {
      need(can(user, "crm.deals"));
      const where = (await scopeWhere(user, "crm.deals")) as Prisma.DealWhereInput, { skip, take } = page(p);
      const [rows, total] = await Promise.all([
        db.deal.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, select: { id: true, title: true, value: true, createdAt: true, stage: { select: { name: true, kind: true } }, owner: { select: { name: true } } } }),
        db.deal.count({ where }),
      ]);
      return { result: rows.map((d) => ({ id: d.id, title: d.title, value: d.value, stage: d.stage.name, won: d.stage.kind === "won", lost: d.stage.kind === "lost", responsible: d.owner?.name ?? null, created_at: d.createdAt })), total, next: skip + take < total ? skip + take : undefined };
    },
  },
  // ── Users
  {
    name: "user.current", scope: "users", about: "Who this link acts as.", params: [],
    run: async ({ user }) => ({ result: { id: user.id, name: user.name, email: user.email, roles: user.roleNames, branch: user.branchName } }),
  },
  {
    name: "user.list", scope: "users", about: "Active colleagues (name, email, branch, title).", params: [],
    run: async () => ({ result: (await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, title: true, branch: { select: { name: true } } } })).map((u) => ({ id: u.id, name: u.name, email: u.email, title: u.title, branch: u.branch?.name ?? null })) }),
  },
  // ── HR
  {
    name: "hr.employee.list", scope: "hr", about: "Employees you can see: code, name, department, designation, status. Never salaries, CNICs or bank details.", params: [],
    run: async ({ user }) => {
      need(can(user, "hr.employees"));
      const where = (await scopeWhere(user, "hr.employees", "view", { owner: "userId", branch: "branchId" })) as Prisma.EmployeeWhereInput | null;
      need(!!where);
      const rows = await db.employee.findMany({ where: where!, orderBy: { fullName: "asc" }, select: { id: true, code: true, fullName: true, status: true, department: { select: { name: true } }, designation: { select: { name: true } } } });
      return { result: rows.map((e) => ({ id: e.id, code: e.code, name: e.fullName, status: e.status, department: e.department?.name ?? null, designation: e.designation?.name ?? null })) };
    },
  },
];

/** Checks a key and its scope for a method; records the call. */
export async function authorize(token: string, method: DevMethod | null, via: "rest" | "mcp") {
  if (!token) throw new ApiError("NO_AUTH", "Missing key.");
  const hook = await db.devHook.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!hook || !hook.active || hook.kind !== "inbound") throw new ApiError("NO_AUTH", "Unknown or switched-off key.");
  const { disabledFeatures } = await import("./features");
  if ((await disabledFeatures()).has("dev-api")) throw new ApiError("ACCESS_DENIED", "Developer resources are switched off in Settings → Company → Apps & features.");
  const scopes = new Set(hook.scopes.split(",").map((s) => s.trim()));
  if (via === "mcp" && !scopes.has("mcp")) throw new ApiError("ACCESS_DENIED", "This key isn't allowed for the AI assistant (MCP). Tick AI assistant (MCP) on it in Settings → Developer resources.");
  if (method && !scopes.has(method.scope)) throw new ApiError("ACCESS_DENIED", `This key doesn't have the ${method.scope} scope.`);
  const user = await loadUserById(hook.userId);
  if (!user) throw new ApiError("NO_AUTH", "The person this key belongs to is no longer active.");
  await db.devHook.update({ where: { id: hook.id }, data: { calls: { increment: 1 }, lastUsedAt: new Date() } }).catch(() => {});
  return { hook, user, scopes };
}

export async function callMethod(name: string, token: string, params: Record<string, unknown>, via: "rest" | "mcp" = "rest") {
  const method = DEV_METHODS.find((m) => m.name === name) ?? null;
  if (!method) throw new ApiError("METHOD_NOT_FOUND", `Unknown method ${name}.`);
  const { user } = await authorize(token, method, via);
  return method.run({ user, p: params });
}

/** The published list: every method with its scope, what it does and its exact parameters. */
export function methodList(scopes?: Set<string>) {
  return DEV_METHODS.filter((m) => !scopes || scopes.has(m.scope)).map((m) => ({ method: m.name, scope: m.scope, changes_data: !!m.write, description: m.about, params: m.params.map((p) => ({ name: p.name, type: p.type, required: !!p.required, description: p.about })) }));
}
