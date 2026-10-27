"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { parseQuestions, respondentKey, type Question } from "@/lib/engagement";
import { str, type FormState } from "@/lib/utils";

const hrAdmin = (u: Awaited<ReturnType<typeof requireUser>>) => u.isSuperAdmin || scopeFor(u, "hr.employees", "edit") === "all";

export async function createSurvey(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!hrAdmin(user)) return { error: "Only HR admins can run surveys." };
  const title = str(fd, "title").slice(0, 150);
  const lines = (k: string) => str(fd, k).split("\n").map((s) => s.trim()).filter(Boolean);
  const questions: Question[] = [...lines("ratings").map((text) => ({ text, kind: "rating" as const })), ...lines("open").map((text) => ({ text, kind: "text" as const }))].slice(0, 25);
  if (!title) return { error: "Give the survey a title." };
  if (!questions.length) return { error: "Add at least one question." };
  const closes = str(fd, "closesAt") ? new Date(`${str(fd, "closesAt")}T23:59:59`) : null;
  const s = await db.engagementSurvey.create({ data: { title, description: str(fd, "description") || null, questions: JSON.stringify(questions), anonymous: fd.get("anonymous") === "on", closesAt: closes, createdById: user.id } });
  const people = await db.employee.findMany({ where: { status: { not: "left" }, userId: { not: null } }, select: { userId: true } });
  for (const p of people) await notify(p.userId, `Quick survey: ${title}`, { body: s.anonymous ? "Your answers are anonymous." : undefined, link: `/me/surveys?open=${s.id}` });
  await audit(user.id, "create", "engagementSurvey", s.id, `Survey ${title}`);
  revalidatePath("/hr/engagement");
  redirect(`/hr/engagement?id=${s.id}`);
}

export async function setSurveyStatus(fd: FormData) {
  const user = await requireUser();
  if (!hrAdmin(user)) return;
  const status = str(fd, "status") === "closed" ? "closed" : "open";
  await db.engagementSurvey.update({ where: { id: str(fd, "id") }, data: { status } });
  revalidatePath("/hr/engagement");
}

/** An employee's answers (once per survey). */
export async function submitSurvey(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
  const s = await db.engagementSurvey.findUnique({ where: { id: str(fd, "surveyId") } });
  if (!emp || !s) return { error: "Survey not found." };
  if (s.status !== "open" || (s.closesAt && s.closesAt < new Date())) return { error: "This survey is closed." };
  const key = respondentKey(s.id, emp.id);
  if (await db.engagementResponse.findUnique({ where: { surveyId_respondentKey: { surveyId: s.id, respondentKey: key } } })) return { error: "You’ve already answered this survey." };
  const answers = parseQuestions(s.questions).map((q, i) => {
    const v = str(fd, `q${i}`);
    return q.kind === "rating" ? (Number(v) >= 1 && Number(v) <= 5 ? Number(v) : null) : v.slice(0, 2000);
  });
  if (parseQuestions(s.questions).some((q, i) => q.kind === "rating" && answers[i] == null)) return { error: "Please rate every question." };
  await db.engagementResponse.create({ data: { surveyId: s.id, respondentKey: key, employeeId: s.anonymous ? null : emp.id, answers: JSON.stringify(answers) } });
  revalidatePath("/me/surveys");
  return { ok: true, message: "Thank you! Your answers were recorded." };
}
