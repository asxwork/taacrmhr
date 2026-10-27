import { db } from "./db";
import { notify } from "./notify";
import { deleteUpload } from "./files";
import { addEvent } from "./hr";
import { APPROVAL_TYPES, SELF_EDITABLE } from "./hr-shared";
import type { SessionUser } from "./auth";

// Generic multi-step approvals. A flow (per request type) is an ordered list of steps; each step is
// approved by the employee's manager, by HR (anyone with company-wide HR edit access), or by a named user.
// When the last step approves, the type's handler applies the change.

export type Step = { kind: "manager" | "hr" | "user"; userId?: string };

export async function flowSteps(type: string): Promise<Step[]> {
  const flow = await db.approvalFlow.findUnique({ where: { type } });
  try {
    const steps = flow?.active ? (JSON.parse(flow.steps) as Step[]) : [];
    return steps.length ? steps : [{ kind: "hr" }];
  } catch {
    return [{ kind: "hr" }];
  }
}

/** Users with company-wide HR edit rights, plus Super Admins. */
export async function hrApproverIds() {
  const users = await db.user.findMany({
    where: {
      active: true,
      OR: [{ isSuperAdmin: true }, { roles: { some: { role: { permissions: { some: { module: "hr.employees", action: "edit", scope: "all" } } } } } }],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

type RequestCore = { type: string; step: number; employeeId: string; requesterId: string | null };

/** Who can act on the request's current step. A manager step with no manager falls through to HR. */
export async function approversFor(req: RequestCore) {
  const step = (await flowSteps(req.type))[req.step];
  if (!step) return [];
  if (step.kind === "user" && step.userId) return [step.userId];
  if (step.kind === "manager") {
    const emp = await db.employee.findUnique({ where: { id: req.employeeId }, select: { manager: { select: { userId: true } } } });
    if (emp?.manager?.userId) return [emp.manager.userId];
  }
  return hrApproverIds();
}

export async function canAct(user: SessionUser, req: RequestCore & { status: string }) {
  if (req.status !== "pending") return false;
  if (user.isSuperAdmin) return true;
  if (req.requesterId === user.id) return false; // nobody approves their own request
  return (await approversFor(req)).includes(user.id);
}

export async function submitRequest(input: { type: string; employeeId: string; requesterId: string; title: string; summary?: string; payload: unknown }) {
  const req = await db.approvalRequest.create({
    data: {
      type: input.type, employeeId: input.employeeId, requesterId: input.requesterId, title: input.title,
      summary: input.summary ?? null, payload: JSON.stringify(input.payload ?? {}),
      actions: { create: { step: 0, userId: input.requesterId, decision: "submitted" } },
    },
  });
  for (const id of await approversFor(req)) {
    if (id !== input.requesterId) await notify(id, `Approval needed: ${input.title}`, { body: APPROVAL_TYPES[input.type] ?? input.type, link: `/approvals?open=${req.id}`, email: true });
  }
  return req;
}

export async function decide(user: SessionUser, requestId: string, decision: "approved" | "rejected", comment?: string) {
  const req = await db.approvalRequest.findUnique({ where: { id: requestId } });
  if (!req || !(await canAct(user, req))) return { error: "You can't act on this request." };
  if (decision === "rejected" && !comment) return { error: "Add a reason when rejecting." };

  await db.approvalAction.create({ data: { requestId, step: req.step, userId: user.id, decision, comment: comment || null } });
  const steps = await flowSteps(req.type);

  if (decision === "rejected") {
    await db.approvalRequest.update({ where: { id: requestId }, data: { status: "rejected", decidedAt: new Date() } });
    await onRejected(req, "rejected");
    await notify(req.requesterId, `Rejected: ${req.title}`, { body: `${user.name}: ${comment}`, link: `/approvals?open=${req.id}`, email: true });
    return { ok: true };
  }

  const next = req.step + 1;
  if (next < steps.length) {
    const advanced = await db.approvalRequest.update({ where: { id: requestId }, data: { step: next } });
    for (const id of await approversFor(advanced)) await notify(id, `Approval needed: ${req.title}`, { body: `Approved by ${user.name}, now with you`, link: `/approvals?open=${req.id}`, email: true });
    return { ok: true };
  }

  await db.approvalRequest.update({ where: { id: requestId }, data: { status: "approved", decidedAt: new Date() } });
  await onApproved(req, user.id);
  await notify(req.requesterId, `Approved: ${req.title}`, { body: `By ${user.name}`, link: `/approvals?open=${req.id}`, email: true });
  return { ok: true };
}

export async function cancelRequest(user: SessionUser, requestId: string) {
  const req = await db.approvalRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "pending" || req.requesterId !== user.id) return { error: "You can't cancel this request." };
  await db.approvalRequest.update({ where: { id: requestId }, data: { status: "cancelled", decidedAt: new Date() } });
  await db.approvalAction.create({ data: { requestId, step: req.step, userId: user.id, decision: "cancelled" } });
  await onRejected(req, "cancelled");
  return { ok: true };
}

// ─── Type handlers ───────────────────────────────────────────

type Req = { id: string; type: string; employeeId: string; payload: string; title: string; requesterId?: string | null };
const parse = <T,>(s: string) => { try { return JSON.parse(s) as T; } catch { return {} as T; } };

async function onApproved(req: Req, actorId: string) {
  switch (req.type) {
    case "profile_update": {
      const { changes } = parse<{ changes: Record<string, string | null> }>(req.payload);
      const allowed = new Set<string>(SELF_EDITABLE.map((f) => f.key));
      const data = Object.fromEntries(Object.entries(changes ?? {}).filter(([k]) => allowed.has(k)));
      if (Object.keys(data).length) {
        await db.employee.update({ where: { id: req.employeeId }, data });
        await addEvent(req.employeeId, "note", "Profile updated (approved request)", { details: Object.keys(data).join(", "), byId: actorId });
      }
      break;
    }
    case "leave": {
      const { leaveRequestId } = parse<{ leaveRequestId: string }>(req.payload);
      if (leaveRequestId) await (await import("./leave")).onLeaveDecision(leaveRequestId, "approved", actorId);
      break;
    }
    case "loan": {
      const { loanId } = parse<{ loanId: string }>(req.payload);
      if (loanId) await db.loan.updateMany({ where: { id: loanId, status: "pending" }, data: { status: "active" } });
      break;
    }
    case "expense": {
      const { expenseId } = parse<{ expenseId: string }>(req.payload);
      if (expenseId) await db.expense.updateMany({ where: { id: expenseId, status: "pending" }, data: { status: "approved" } });
      break;
    }
    case "attendance_correction": {
      await (await import("./attendance")).applyCorrection(req.employeeId, parse(req.payload), actorId);
      break;
    }
    case "document": {
      const { documentId } = parse<{ documentId: string }>(req.payload);
      if (documentId) await db.employeeDocument.updateMany({ where: { id: documentId, employeeId: req.employeeId }, data: { verified: true } });
      break;
    }
    case "salary_revision": {
      const { revisionIds } = parse<{ revisionIds: string[] }>(req.payload);
      if (revisionIds?.length) await (await import("./compensation")).applyRevisions(revisionIds, actorId);
      break;
    }
    case "leave_encashment": {
      const { encashmentId } = parse<{ encashmentId: string }>(req.payload);
      if (encashmentId) await (await import("./compensation")).approveEncashment(encashmentId, actorId);
      break;
    }
    default:
      // WFH, travel, promotion, resignation… (lib/request-types.ts)
      await (await import("./requests")).applyTypedRequest(req, actorId);
  }
}

async function onRejected(req: Req, status: "rejected" | "cancelled") {
  if (req.type === "loan" || req.type === "expense") {
    const p = parse<{ loanId?: string; expenseId?: string }>(req.payload);
    if (p.loanId) await db.loan.updateMany({ where: { id: p.loanId, status: "pending" }, data: { status } });
    if (p.expenseId) await db.expense.updateMany({ where: { id: p.expenseId, status: "pending" }, data: { status } });
  }
  if (req.type === "leave") {
    const { leaveRequestId } = parse<{ leaveRequestId: string }>(req.payload);
    if (leaveRequestId) await (await import("./leave")).onLeaveDecision(leaveRequestId, status);
  }
  if (req.type === "salary_revision") {
    const { revisionIds } = parse<{ revisionIds: string[] }>(req.payload);
    if (revisionIds?.length) await (await import("./compensation")).closeRevisions(revisionIds, status);
  }
  if (req.type === "leave_encashment") {
    const { encashmentId } = parse<{ encashmentId: string }>(req.payload);
    if (encashmentId) await (await import("./compensation")).closeEncashment(encashmentId, status);
  }
  if (req.type === "document") {
    const { documentId } = parse<{ documentId: string }>(req.payload);
    const doc = documentId ? await db.employeeDocument.findFirst({ where: { id: documentId, employeeId: req.employeeId, verified: false } }) : null;
    if (doc) {
      await deleteUpload(doc.path);
      await db.employeeDocument.delete({ where: { id: doc.id } });
    }
  }
}

/** Pending requests the user can act on right now. */
export async function pendingForUser(user: SessionUser) {
  const pending = await db.approvalRequest.findMany({
    where: { status: "pending" },
    include: { employee: { select: { fullName: true, code: true } }, requester: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  const out = [];
  for (const r of pending) if (await canAct(user, r)) out.push(r);
  return out;
}
