"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { addMonths } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { saveUpload } from "@/lib/files";
import { addEvent, ensureChecklist, getSetting, nextEmployeeCode, syncUserFromEmployee } from "@/lib/hr";
import { CANDIDATE_STAGES } from "@/lib/hr-shared";
import { str, type FormState } from "@/lib/utils";

export async function saveOpening(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const user = await requirePermission("hr.recruitment", id ? "edit" : "create");
  const title = str(fd, "title");
  if (title.length < 2) return { error: "Job title is required." };
  const data = {
    title, departmentId: str(fd, "departmentId") || null, branchId: str(fd, "branchId") || null,
    positions: Math.max(1, Math.round(Number(str(fd, "positions")) || 1)), salaryRange: str(fd, "salaryRange") || null,
    description: str(fd, "description") || null, status: ["open", "on_hold", "closed"].includes(str(fd, "status")) ? str(fd, "status") : "open",
  };
  const opening = id ? await db.jobOpening.update({ where: { id }, data }) : await db.jobOpening.create({ data: { ...data, createdById: user.id } });
  await audit(user.id, id ? "update" : "create", "jobOpening", opening.id, `${id ? "Updated" : "Opened"} job ${title}`);
  revalidatePath("/hr/recruitment");
  redirect(`/hr/recruitment/${opening.id}`);
}

export async function saveCandidate(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const user = await requirePermission("hr.recruitment", id ? "edit" : "create");
  const openingId = str(fd, "openingId");
  const name = str(fd, "name");
  if (name.length < 2) return { error: "Candidate name is required." };
  if (!(await db.jobOpening.findUnique({ where: { id: openingId } }))) return { error: "Opening not found." };
  let cv: string | undefined;
  const file = fd.get("cv");
  if (file instanceof File && file.size > 0) {
    const res = await saveUpload(file, `cvs/${openingId}`, { maxBytes: 10_000_000, allowPdf: true });
    if ("error" in res) return { error: res.error };
    cv = res.path;
  }
  const salary = parseFloat(str(fd, "expectedSalary").replace(/,/g, ""));
  const rating = Number(str(fd, "rating"));
  const data = {
    name, phone: str(fd, "phone") || null, email: str(fd, "email").toLowerCase() || null, source: str(fd, "source") || null,
    expectedSalary: Number.isFinite(salary) ? salary : null, rating: rating >= 1 && rating <= 5 ? rating : null, notes: str(fd, "notes") || null,
    ...(cv && { cv }),
  };
  const c = id ? await db.candidate.update({ where: { id }, data }) : await db.candidate.create({ data: { ...data, openingId } });
  await audit(user.id, id ? "update" : "create", "candidate", c.id, `${id ? "Updated" : "Added"} candidate ${name}`);
  revalidatePath(`/hr/recruitment/${openingId}`);
  redirect(`/hr/recruitment/${openingId}?c=${c.id}`);
}

async function applyStage(candidateId: string, stage: string, userId: string) {
  const c = await db.candidate.findUnique({ where: { id: candidateId } });
  if (!c || c.stage === "hired" || !CANDIDATE_STAGES.some((s) => s.value === stage) || stage === "hired") return { error: "Use “Hire” to move a candidate to Hired." };
  await db.candidate.update({ where: { id: c.id }, data: { stage } });
  await audit(userId, "update", "candidate", c.id, `${c.name}: ${c.stage} → ${stage}`);
  return { openingId: c.openingId };
}

/** Kanban drop. */
export async function moveCandidate(id: string, stage: string) {
  const user = await requirePermission("hr.recruitment", "edit");
  const res = await applyStage(id, stage, user.id);
  if ("openingId" in res) revalidatePath(`/hr/recruitment/${res.openingId}`);
  return "error" in res ? res : {};
}

export async function setCandidateStage(fd: FormData) {
  const user = await requirePermission("hr.recruitment", "edit");
  const res = await applyStage(str(fd, "id"), str(fd, "stage"), user.id);
  if ("openingId" in res) revalidatePath(`/hr/recruitment/${res.openingId}`);
}

export async function scheduleInterview(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("hr.recruitment", "edit");
  const c = await db.candidate.findUnique({ where: { id: str(fd, "candidateId") }, include: { opening: true } });
  // The time is typed in Pakistan time (datetime-local has no zone): read it as +05:00.
  const raw = str(fd, "at");
  const at = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(raw) ? raw : `${raw}:00+05:00`.replace(/:00:00\+/, ":00+"));
  if (!c) return { error: "Candidate not found." };
  if (Number.isNaN(at.getTime())) return { error: "Choose the interview date and time." };
  const interviewerId = str(fd, "interviewerId") || null;
  const durationMin = Math.min(240, Math.max(10, Number(str(fd, "durationMin")) || 30));
  const mode = ["onsite", "phone", "video"].includes(str(fd, "mode")) ? str(fd, "mode") : "onsite";
  const location = str(fd, "location").slice(0, 190) || null, meetingLink = str(fd, "meetingLink").slice(0, 500) || null;
  // Clash check: the interviewer already has an interview overlapping this time.
  if (interviewerId && fd.get("force") !== "1") {
    const end = new Date(+at + durationMin * 60_000);
    const near = await db.interview.findMany({ where: { interviewerId, status: "scheduled", at: { gte: new Date(+at - 4 * 3_600_000), lt: end } }, include: { candidate: { select: { name: true } } } });
    const clash = near.find((i) => +i.at + i.durationMin * 60_000 > +at);
    if (clash) return { error: `The interviewer already has ${clash.candidate.name} at ${clash.at.toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" })}. Pick another time (or tick “Book anyway”).` };
  }
  const i = await db.interview.create({ data: { candidateId: c.id, at, mode, interviewerId, durationMin, location, meetingLink } });
  if (["applied", "screening"].includes(c.stage)) await db.candidate.update({ where: { id: c.id }, data: { stage: "interview" } });
  const when = at.toLocaleString("en-PK", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" });
  if (interviewerId && interviewerId !== user.id) {
    await notify(interviewerId, `Interview: ${c.name} for ${c.opening.title}`, { body: `${when} · ${durationMin} min · ${mode === "video" ? "video call" : mode === "phone" ? "phone" : location ?? "in office"}`, link: "/hr/recruitment/interviews", email: true });
  }
  // Invite the candidate by email, with the time, place / link and an "add to calendar" link.
  let invited = false;
  if (fd.get("invite") === "on" && c.email) {
    const { sendMail } = await import("@/lib/mail");
    const { googleCalendarUrl } = await import("@/lib/interview-shared");
    const where = mode === "video" ? `Video call${meetingLink ? `: ${meetingLink}` : " (we'll send the link)"}` : mode === "phone" ? "Phone call: we'll call you on your number" : `In person${location ? `: ${location}` : ""}`;
    const cal = googleCalendarUrl(`Interview: ${c.opening.title}`, at, durationMin, where, mode === "video" ? meetingLink ?? "" : location ?? "");
    const body = `Dear ${c.name},\n\nThank you for applying for ${c.opening.title}. We'd like to invite you to an interview.\n\nWhen: ${when} (Pakistan time), about ${durationMin} minutes\nWhere: ${where}\n\nPlease reply to this email to confirm, or if you need another time.\n\nAdd to Google Calendar:\n${cal}\n\nBest regards,\nHR Team`;
    const r = await sendMail(c.email, `Interview invitation: ${c.opening.title}`, body, { userId: null }).catch(() => null);
    if (r?.status === "sent") { invited = true; await db.interview.update({ where: { id: i.id }, data: { invitedAt: new Date() } }); }
  }
  revalidatePath(`/hr/recruitment/${c.openingId}`);
  revalidatePath("/hr/recruitment/interviews");
  return { ok: true, message: `Interview scheduled for ${when}.${fd.get("invite") === "on" ? (invited ? " Invitation emailed to the candidate." : c.email ? " The invitation email couldn't be sent." : " The candidate has no email: send the invite on WhatsApp.") : ""}` };
}

export async function saveFeedback(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("hr.recruitment", "edit");
  const i = await db.interview.findUnique({ where: { id: str(fd, "id") }, include: { candidate: true } });
  if (!i) return { error: "Interview not found." };
  const outcome = ["pass", "fail", "hold"].includes(str(fd, "outcome")) ? str(fd, "outcome") : null;
  const { SCORE_CRITERIA } = await import("@/lib/interview-shared");
  const scores = Object.fromEntries(SCORE_CRITERIA.map((k, n) => [k, Number(str(fd, `score_${n}`))]).filter(([, v]) => Number(v) >= 1 && Number(v) <= 5));
  const recommendation = ["hire", "maybe", "no"].includes(str(fd, "recommendation")) ? str(fd, "recommendation") : null;
  await db.interview.update({ where: { id: i.id }, data: {
    outcome, feedback: str(fd, "feedback") || null, recommendation,
    ...(Object.keys(scores).length ? { scorecard: JSON.stringify(scores) } : {}),
    ...((outcome || recommendation || Object.keys(scores).length) && i.status === "scheduled" ? { status: "done" } : {}),
  } });
  await audit(user.id, "update", "interview", i.id, `Feedback for ${i.candidate.name}: ${outcome ?? recommendation ?? "—"}`);
  revalidatePath(`/hr/recruitment/${i.candidate.openingId}`);
  revalidatePath("/hr/recruitment/interviews");
  return { ok: true, message: "Scorecard saved." };
}

/** Mark an interview cancelled, no-show, done, or back to scheduled. */
export async function setInterviewStatus(fd: FormData) {
  const user = await requirePermission("hr.recruitment", "edit");
  const status = str(fd, "status");
  if (!["scheduled", "done", "cancelled", "no_show"].includes(status)) return;
  const i = await db.interview.update({ where: { id: str(fd, "id") }, data: { status }, include: { candidate: true } }).catch(() => null);
  if (!i) return;
  await audit(user.id, "update", "interview", i.id, `Interview ${status} (${i.candidate.name})`);
  revalidatePath(`/hr/recruitment/${i.candidate.openingId}`);
  revalidatePath("/hr/recruitment/interviews");
}

/** Hire: creates the employee record from the candidate and the opening, then opens it for completion. */
export async function hireCandidate(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("hr.employees", "create");
  await requirePermission("hr.recruitment", "edit");
  const c = await db.candidate.findUnique({ where: { id: str(fd, "id") }, include: { opening: true } });
  if (!c || c.stage === "hired") return { error: "Candidate not found or already hired." };
  const joiningDate = new Date(str(fd, "joiningDate"));
  if (Number.isNaN(joiningDate.getTime())) return { error: "Choose the joining date." };
  const designation = str(fd, "designationId") || null;
  const months = Number(await getSetting("hr.probationMonths", "3")) || 0;

  const emp = await db.employee.create({
    data: {
      code: await nextEmployeeCode(), fullName: c.name, phone: c.phone, personalEmail: c.email, joiningDate,
      status: months ? "probation" : "active", probationEnd: months ? addMonths(joiningDate, months) : null, confirmedAt: months ? null : joiningDate,
      departmentId: c.opening.departmentId, branchId: c.opening.branchId, designationId: designation,
    },
  });
  if (c.cv) await db.employeeDocument.create({ data: { employeeId: emp.id, type: "Resume / CV", title: `CV — ${c.name}`, path: c.cv, size: 0, uploadedById: user.id } }).catch(() => {});
  await db.candidate.update({ where: { id: c.id }, data: { stage: "hired", hiredEmployeeId: emp.id } });
  await addEvent(emp.id, "joined", `Hired for ${c.opening.title}`, { date: joiningDate, byId: user.id });
  await ensureChecklist(emp.id, "onboarding");
  await syncUserFromEmployee(emp.id);
  const hired = await db.candidate.count({ where: { openingId: c.openingId, stage: "hired" } });
  if (hired >= c.opening.positions) await db.jobOpening.update({ where: { id: c.openingId }, data: { status: "closed" } });
  if (c.expectedSalary) await db.salaryProfile.create({ data: { employeeId: emp.id, gross: c.expectedSalary, effectiveFrom: joiningDate } });
  await audit(user.id, "create", "employee", emp.id, `Hired ${c.name} (${emp.code}) from recruitment`);
  redirect(`/hr/employees/${emp.id}?edit=1`);
}
