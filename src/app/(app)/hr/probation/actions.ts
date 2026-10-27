"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { hrApproverIds } from "@/lib/approvals";
import { PERF_KEYS, decideProbation, perfSettings } from "@/lib/performance-settings";
import { str, type FormState } from "@/lib/utils";

const hrAdmin = (u: Awaited<ReturnType<typeof requireUser>>) => u.isSuperAdmin || scopeFor(u, "hr.employees", "edit") === "all";

/** The line manager (or HR) rates each probation criterion and recommends confirm / extend / terminate. */
export async function submitProbationReview(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { id: str(fd, "employeeId") }, include: { manager: { select: { userId: true } } } });
  if (!emp || emp.status !== "probation") return { error: "This employee isn't on probation." };
  if (emp.manager?.userId !== user.id && !hrAdmin(user) && !can(user, "hr.performance", "edit")) return { error: "Only their line manager or HR can evaluate them." };
  const { probationCriteria } = await perfSettings();
  const ratings: Record<string, number> = {};
  for (const [i, c] of probationCriteria.entries()) {
    const v = Number(str(fd, `r${i}`));
    if (!(v >= 1 && v <= 5)) return { error: `Rate “${c}”.` };
    ratings[c] = v;
  }
  const recommendation = ["confirm", "extend", "terminate"].includes(str(fd, "recommendation")) ? str(fd, "recommendation") : "";
  if (!recommendation) return { error: "Choose a recommendation." };
  const comments = str(fd, "comments").slice(0, 3000) || null;
  if (recommendation !== "confirm" && !comments) return { error: "Add comments explaining the recommendation." };
  const overall = Object.values(ratings).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(ratings).length);
  await db.probationReview.create({
    data: { employeeId: emp.id, reviewerId: user.id, ratings: JSON.stringify(ratings), overall, recommendation, extendMonths: recommendation === "extend" ? Number(str(fd, "extendMonths")) || 3 : null, comments },
  });
  for (const id of await hrApproverIds()) if (id !== user.id) await notify(id, `Probation review: ${emp.fullName} (${recommendation})`, { body: `Score ${overall.toFixed(1)}/5 by ${user.name}`, link: "/hr/probation", email: true });
  await audit(user.id, "create", "probationReview", emp.id, `Probation review for ${emp.fullName}: ${recommendation}`);
  revalidatePath("/hr/probation");
  return { ok: true, message: "Review submitted to HR." };
}

export async function decideProbationAction(fd: FormData) {
  const user = await requireUser();
  if (!hrAdmin(user)) return;
  const decision = str(fd, "decision") as "confirm" | "extend" | "terminate";
  if (!["confirm", "extend", "terminate"].includes(decision)) return;
  await decideProbation(str(fd, "id"), decision, user.id, Number(str(fd, "extendMonths")) || undefined);
  await audit(user.id, "update", "probationReview", str(fd, "id"), `Probation decision: ${decision}`);
  revalidatePath("/hr/probation");
}

/** Assessment → Settings (General and Performance pages share this; only the fields on the form change). */
export async function savePerfSettings(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!(user.isSuperAdmin || scopeFor(user, "hr.performance", "edit") === "all")) return { error: "Only HR admins can change assessment settings." };
  const set = (key: string, value: string) => db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  if (fd.has("form:general")) {
    await set(PERF_KEYS.selfReview, fd.get("selfReview") === "on" ? "on" : "off");
    await set(PERF_KEYS.goalsTemplate, str(fd, "goalsTemplate").slice(0, 4000));
  }
  if (fd.has("form:probation")) {
    const criteria = str(fd, "probationCriteria").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 15);
    if (!criteria.length) return { error: "Add at least one probation criterion." };
    await set(PERF_KEYS.probationCriteria, criteria.join("\n"));
    await set(PERF_KEYS.probationReminderDays, String(Math.max(1, Math.min(60, Number(str(fd, "probationReminderDays")) || 14))));
  }
  await audit(user.id, "update", "setting", "perf", "Assessment settings updated");
  revalidatePath("/hr/performance/general");
  revalidatePath("/hr/performance/settings");
  return { ok: true, message: "Saved." };
}
