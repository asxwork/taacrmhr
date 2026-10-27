// HR requests from REQUEST_TYPES (WFH, travel, promotion, resignation…): validation, submission through the
// approval engine, and what an approved request changes, so every request is connected to the records it affects.
import { addMonths, eachDayOfInterval, format, startOfDay } from "date-fns";
import { recordRevision } from "./compensation";
import { db } from "./db";
import { submitRequest } from "./approvals";
import { addEvent, employeeWhere, ensureChecklist } from "./hr";
import { defaultShift, isWorkDay, logAttendance } from "./attendance";
import { notify } from "./notify";
import { requestTypeBySlug, requestTypeByType, type ReqType } from "./request-types";
import type { SessionUser } from "./auth";
import type { FormState } from "./utils";

type Payload = Record<string, string>;
const MAX_DAYS = 31;

const dayOf = (v?: string) => {
  const d = v ? new Date(`${v}T00:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/** Employees the user may raise a request for: themselves, plus anyone in their HR view scope for forOthers types. */
export async function requestableEmployees(user: SessionUser, t: ReqType) {
  const self = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true, fullName: true } });
  if (!t.forOthers) return self ? [self] : [];
  const scope = await employeeWhere(user);
  const others = scope ? await db.employee.findMany({ where: { ...scope, status: { not: "left" } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }) : [];
  return others.length ? others : self ? [self] : [];
}

/** One-line title for lists and notifications. */
function titleFor(t: ReqType, p: Payload, name: string, names: Record<string, string>) {
  const range = (a?: string, b?: string) => (a && b && a !== b ? `${format(dayOf(a)!, "d MMM")}–${format(dayOf(b)!, "d MMM")}` : a ? format(dayOf(a)!, "d MMM") : "");
  switch (t.type) {
    case "ticket": return `Ticket: ${p.subject}`;
    case "wfh": return `WFH ${range(p.from, p.to)} · ${name}`;
    case "official_duty": return `Official duty ${range(p.date)} at ${p.place} · ${name}`;
    case "overtime": return `Overtime ${p.hours}h on ${range(p.date)} · ${name}`;
    case "promotion": return `Promotion to ${names.designationId ?? "—"} · ${name}`;
    case "relaxation": return `Relaxation ${range(p.date)} · ${name}`;
    case "transfer": return `Transfer to ${[names.branchId, names.departmentId].filter(Boolean).join(" / ")} · ${name}`;
    case "travel": return `Travel to ${p.destination} ${range(p.from, p.to)} · ${name}`;
    case "requisition": return `Requisition: ${p.positions} × ${p.title}`;
    case "resignation": return `Resignation · ${name} (last day ${range(p.lastDay)})`;
    case "shift_adjustment": return `Shift adjustment ${range(p.date)} · ${name}`;
    case "cpl": return `CPL for ${range(p.date)} · ${name}`;
    default: return `${t.label} · ${name}`;
  }
}

/** Display names for select fields (designation, branch…), stored with the payload so lists read well. */
async function selectNames(t: ReqType, p: Payload) {
  const out: Record<string, string> = {};
  for (const f of t.fields.filter((f) => f.kind === "select" && p[f.name])) {
    const id = p[f.name]!;
    const name = f.options ? f.options.find(([v]) => v === id)?.[1]
      : f.source === "branches" ? (await db.branch.findUnique({ where: { id }, select: { name: true } }))?.name
      : f.source === "departments" ? (await db.department.findUnique({ where: { id }, select: { name: true } }))?.name
      : f.source === "designations" ? (await db.designation.findUnique({ where: { id }, select: { name: true } }))?.name
      : f.source === "shifts" ? (await db.shift.findUnique({ where: { id }, select: { name: true } }))?.name : undefined;
    if (!name) throw new Error(`Choose a valid ${f.label.toLowerCase()}.`);
    out[f.name] = name;
  }
  return out;
}

export async function submitTypedRequest(user: SessionUser, slug: string, fd: FormData): Promise<FormState & { requestId?: string }> {
  const t = requestTypeBySlug(slug);
  if (!t) return { error: "Unknown request type." };
  const allowed = await requestableEmployees(user, t);
  const employeeId = t.forOthers ? String(fd.get("employeeId") ?? "") : allowed[0]?.id;
  const emp = allowed.find((e) => e.id === employeeId);
  if (!emp) return { error: allowed.length ? "Choose the employee." : "Your login isn't linked to an employee record yet. Ask HR." };

  const p: Payload = {};
  for (const f of t.fields) {
    const v = String(fd.get(f.name) ?? "").trim();
    if (f.required && !v) return { error: `${f.label} is required.` };
    if (!v) continue;
    if (f.kind === "date" && !dayOf(v)) return { error: `${f.label}: invalid date.` };
    if (f.kind === "time" && !/^\d{2}:\d{2}$/.test(v)) return { error: `${f.label}: invalid time.` };
    if (f.kind === "number" && !(Number(v) > 0)) return { error: `${f.label} must be a positive number.` };
    p[f.name] = v.slice(0, 2000);
  }
  if (p.from && p.to) {
    if (dayOf(p.to)! < dayOf(p.from)!) return { error: "The end date is before the start date." };
    if (eachDayOfInterval({ start: dayOf(p.from)!, end: dayOf(p.to)! }).length > MAX_DAYS) return { error: `At most ${MAX_DAYS} days per request.` };
  }
  if (t.type === "transfer" && !p.branchId && !p.departmentId) return { error: "Choose a new branch or department." };
  if (t.type === "shift_adjustment" && !p.shiftId && !(p.start && p.end)) return { error: "Choose a shift or enter start and end times." };
  if (t.type === "resignation" && dayOf(p.lastDay)! < startOfDay(new Date())) return { error: "The last working day can't be in the past." };

  let names: Record<string, string>;
  try { names = await selectNames(t, p); } catch (e) { return { error: (e as Error).message }; }
  const title = titleFor(t, p, emp.fullName, names);
  const req = await submitRequest({ type: t.type, employeeId: emp.id, requesterId: user.id, title, summary: p.reason ?? p.details ?? undefined, payload: { ...p, names } });
  return { ok: true, message: "Sent for approval.", requestId: req.id };
}

/** Called by the approval engine when the last step approves a REQUEST_TYPES request. */
export async function applyTypedRequest(req: { id: string; type: string; employeeId: string; payload: string; title: string; requesterId?: string | null }, actorId: string) {
  const t = requestTypeByType(req.type);
  if (!t) return;
  let p: Payload & { names?: Record<string, string> } = {};
  try { p = JSON.parse(req.payload); } catch {}
  const emp = await db.employee.findUnique({ where: { id: req.employeeId }, include: { shift: true, user: { select: { id: true } } } });
  if (!emp) return;
  const event = (type: string, title: string, details?: string, date?: Date) => addEvent(emp.id, type, title, { details: details ?? p.reason ?? null, byId: actorId, date });

  /** Marks days present with a note, so WFH / duty / travel days aren't absences. Off days are left alone. */
  const markPresent = async (from: Date, to: Date, what: string) => {
    const shift = emp.shift ?? (await defaultShift());
    for (const day of eachDayOfInterval({ start: from, end: to }).slice(0, MAX_DAYS)) {
      if (shift && !isWorkDay(shift, day)) continue;
      await db.attendanceDay.upsert({
        where: { employeeId_date: { employeeId: emp.id, date: day } },
        update: { status: "present", note: what, corrected: true },
        create: { employeeId: emp.id, date: day, status: "present", note: what, corrected: true },
      });
      await logAttendance({ employeeId: emp.id, date: day, kind: "correction", source: "manual", byId: actorId, summary: `${what}: marked present` });
    }
  };

  switch (t.type) {
    case "wfh":
      await markPresent(dayOf(p.from)!, dayOf(p.to)!, "Work from home");
      break;
    case "travel":
      await markPresent(dayOf(p.from)!, dayOf(p.to)!, `Travel: ${p.destination}`);
      await event("note", `Travel to ${p.destination}`, p.reason, dayOf(p.from)!);
      break;
    case "official_duty":
      await markPresent(dayOf(p.date)!, dayOf(p.date)!, `Official duty: ${p.place}`);
      break;
    case "relaxation": {
      const day = dayOf(p.date)!;
      const what = `Relaxation: ${p.kind === "late" ? "late arrival" : p.kind === "early" ? "early exit" : "late arrival and early exit"} waived`;
      await db.attendanceDay.upsert({
        where: { employeeId_date: { employeeId: emp.id, date: day } },
        update: { status: "present", note: what, corrected: true },
        create: { employeeId: emp.id, date: day, status: "present", note: what, corrected: true },
      });
      await logAttendance({ employeeId: emp.id, date: day, kind: "correction", source: "manual", byId: actorId, summary: what });
      break;
    }
    case "overtime":
      await event("note", `Overtime: ${p.hours}h on ${format(dayOf(p.date)!, "d MMM yyyy")}`, p.reason, dayOf(p.date)!);
      break;
    case "shift_adjustment":
      // The adjusted day goes on the roster, so attendance judges it against the new timing.
      await db.rosterDay.upsert({
        where: { employeeId_date: { employeeId: emp.id, date: dayOf(p.date)! } },
        update: { off: false, shiftId: p.shiftId || null, start: p.shiftId ? null : p.start || null, end: p.shiftId ? null : p.end || null, note: "Approved shift adjustment", createdById: actorId },
        create: { employeeId: emp.id, date: dayOf(p.date)!, shiftId: p.shiftId || null, start: p.shiftId ? null : p.start || null, end: p.shiftId ? null : p.end || null, note: "Approved shift adjustment", createdById: actorId },
      });
      await event("note", `Shift adjusted on ${format(dayOf(p.date)!, "d MMM yyyy")}: ${p.names?.shiftId ?? `${p.start}–${p.end}`}`, p.reason, dayOf(p.date)!);
      break;
    case "promotion": {
      const effective = dayOf(p.effective) ?? new Date();
      await db.employee.update({ where: { id: emp.id }, data: { designationId: p.designationId } });
      if (p.salary) {
        const gross = Number(p.salary);
        const profile = await db.salaryProfile.findUnique({ where: { employeeId: emp.id } });
        if (profile) await db.salaryProfile.update({ where: { id: profile.id }, data: { gross, effectiveFrom: effective, nextIncrementAt: addMonths(effective, profile.incrementMonths || 12) } });
        else await db.salaryProfile.create({ data: { employeeId: emp.id, gross, effectiveFrom: effective } });
        await recordRevision({ employeeId: emp.id, oldGross: profile?.gross ?? 0, newGross: gross, effectiveFrom: effective, kind: "promotion", reason: p.reason ?? null, actorId });
      }
      await event("promotion", `Promoted to ${p.names?.designationId ?? "new designation"}${p.salary ? ` · gross PKR ${Number(p.salary).toLocaleString("en-PK")}` : ""}`, p.reason, effective);
      break;
    }
    case "transfer": {
      const effective = dayOf(p.effective) ?? new Date();
      await db.employee.update({ where: { id: emp.id }, data: { ...(p.branchId && { branchId: p.branchId }), ...(p.departmentId && { departmentId: p.departmentId }) } });
      // The login's branch drives branch-scoped access, so it moves with the employee.
      if (p.branchId && emp.user) await db.user.update({ where: { id: emp.user.id }, data: { branchId: p.branchId } });
      await event("transfer", `Transferred to ${[p.names?.branchId, p.names?.departmentId].filter(Boolean).join(" / ")}`, p.reason, effective);
      break;
    }
    case "resignation": {
      if (emp.status === "left") break;
      const lastDay = dayOf(p.lastDay)!;
      await db.employee.update({ where: { id: emp.id }, data: { status: "notice", exitType: "resigned", noticeDate: new Date(), lastWorkingDay: lastDay, exitReason: p.reason ?? null } });
      await event("resigned", "Resigned", `Last working day ${format(lastDay, "d MMM yyyy")}${p.reason ? `\n${p.reason}` : ""}`);
      await ensureChecklist(emp.id, "offboarding");
      break;
    }
    case "requisition":
      await db.jobOpening.create({
        data: {
          title: p.title!, positions: Math.max(1, Math.round(Number(p.positions) || 1)), departmentId: p.departmentId || null, branchId: p.branchId || null,
          salaryRange: p.salaryRange || null, description: p.reason || null, createdById: actorId,
        },
      });
      break;
    case "cpl": {
      // A worked off day becomes one extra day of the first paid, annual-accrual leave type.
      const type = await db.leaveType.findFirst({ where: { active: true, paid: true }, orderBy: [{ accrual: "asc" }, { sortOrder: "asc" }] });
      if (type) {
        const year = new Date().getFullYear();
        await db.leaveBalance.upsert({
          where: { employeeId_typeId_year: { employeeId: emp.id, typeId: type.id, year } },
          update: { adjusted: { increment: 1 }, note: `CPL for ${p.date}` },
          create: { employeeId: emp.id, typeId: type.id, year, adjusted: 1, note: `CPL for ${p.date}` },
        });
      }
      await event("note", `CPL: +1 day ${type ? `of ${type.name}` : "(no paid leave type set up)"} for working on ${format(dayOf(p.date)!, "d MMM yyyy")}`, p.reason);
      break;
    }
    case "ticket":
      await event("note", `Ticket resolved: ${p.subject}`, p.details);
      break;
  }
  // The requester is told by the approval engine; the employee also hears when someone else raised it (promotion, transfer).
  if (emp.user && emp.user.id !== req.requesterId) await notify(emp.user.id, `${t.label} approved`, { body: req.title, link: `/approvals?tab=mine&open=${req.id}` });
}
