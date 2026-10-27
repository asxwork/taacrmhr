import Link from "next/link";
import { fmtPhone, telHref } from "@/lib/crm-shared";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, FileText, Mail, Pencil, Phone, Plus, UserPlus } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { CANDIDATE_STAGES } from "@/lib/hr-shared";
import { color, fmtPKR } from "@/lib/crm-shared";
import { fileUrl } from "@/lib/files";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, Field, LinkButton, PageHeader } from "@/components/ui";
import { Kanban } from "@/components/crm/kanban";
import { StatusPill } from "@/components/crm/bits";
import { hireCandidate, moveCandidate, saveCandidate, saveFeedback, saveOpening, scheduleInterview, setCandidateStage } from "../actions";

export const metadata = { title: "Opening" };
type SP = { add?: string; c?: string; edit?: string; editc?: string };

export default async function OpeningPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requirePermission("hr.recruitment");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const opening = await db.jobOpening.findUnique({ where: { id }, include: { candidates: { orderBy: { createdAt: "desc" } } } });
  if (!opening) notFound();
  const canEdit = can(user, "hr.recruitment", "edit");
  const path = `/hr/recruitment/${id}`;
  const [departments, branches, designations, users] = await Promise.all([
    db.department.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.designation.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const cand = sp.c ? await db.candidate.findFirst({ where: { id: sp.c, openingId: id }, include: { interviews: { orderBy: { at: "desc" } } } }) : null;
  const editCand = sp.editc ? opening.candidates.find((c) => c.id === sp.editc) : null;

  return (
    <>
      <Link href="/hr/recruitment" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> Recruitment</Link>
      <PageHeader
        eyebrow={`${opening.positions} position${opening.positions === 1 ? "" : "s"} · ${opening.status.replace("_", " ")}`}
        title={opening.title}
        description={[departments.find((d) => d.id === opening.departmentId)?.name, branches.find((b) => b.id === opening.branchId)?.name, opening.salaryRange].filter(Boolean).join(" · ")}
        actions={canEdit && (
          <>
            <LinkButton href={`${path}?edit=1`} variant="secondary" scroll={false}><Pencil className="size-4" /> Edit</LinkButton>
            <LinkButton href={`${path}?add=1`} scroll={false}><Plus className="size-4" /> Add candidate</LinkButton>
          </>
        )}
      />

      <Kanban
        columns={CANDIDATE_STAGES.map((s) => ({ id: s.value, name: s.label, dot: color(s.color).dot }))}
        cards={opening.candidates.map((c) => ({
          id: c.id, columnId: c.stage, title: c.name, href: `${path}?c=${c.id}`,
          subtitle: [c.source, fmtPhone(c.phone)].filter(Boolean).join(" · ") || undefined,
          meta: c.rating ? "★".repeat(c.rating) : c.expectedSalary ? fmtPKR(c.expectedSalary) : undefined,
          draggable: canEdit && c.stage !== "hired",
        }))}
        onMove={moveCandidate}
      />
      {opening.description && <Card className="mt-6 whitespace-pre-line p-5 text-sm">{opening.description}</Card>}

      {(sp.add || editCand) && canEdit && (
        <Drawer title={editCand ? `Edit ${editCand.name}` : "Add candidate"} closeHref={editCand ? `${path}?c=${editCand.id}` : path}>
          <ActionForm action={saveCandidate} className="space-y-4">
            <input type="hidden" name="openingId" value={id} />
            {editCand && <input type="hidden" name="id" value={editCand.id} />}
            <Field label="Full name"><input name="name" required defaultValue={editCand?.name} className="input" autoFocus /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone"><input name="phone" defaultValue={editCand?.phone ?? ""} className="input" /></Field>
              <Field label="Email"><input name="email" type="email" defaultValue={editCand?.email ?? ""} className="input" /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Source"><input name="source" defaultValue={editCand?.source ?? ""} className="input" placeholder="LinkedIn, Rozee…" /></Field>
              <Field label="Expected salary"><input name="expectedSalary" inputMode="decimal" defaultValue={editCand?.expectedSalary ?? ""} className="input" /></Field>
              <Field label="Rating (1–5)"><input name="rating" type="number" min={1} max={5} defaultValue={editCand?.rating ?? ""} className="input" /></Field>
            </div>
            <Field label={editCand?.cv ? "Replace CV" : "CV (PDF or image)"}><input name="cv" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" /></Field>
            <Field label="Notes"><textarea name="notes" rows={3} defaultValue={editCand?.notes ?? ""} className="input" /></Field>
            <SubmitButton>{editCand ? "Save" : "Add candidate"}</SubmitButton>
          </ActionForm>
        </Drawer>
      )}

      {sp.edit && canEdit && (
        <Drawer title="Edit opening" closeHref={path}>
          <ActionForm action={saveOpening} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <Field label="Job title"><input name="title" required defaultValue={opening.title} className="input" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Department"><select name="departmentId" defaultValue={opening.departmentId ?? ""} className="input"><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
              <Field label="Branch"><select name="branchId" defaultValue={opening.branchId ?? ""} className="input"><option value="">—</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Positions"><input name="positions" type="number" min={1} defaultValue={opening.positions} className="input" /></Field>
              <Field label="Salary range"><input name="salaryRange" defaultValue={opening.salaryRange ?? ""} className="input" /></Field>
              <Field label="Status"><select name="status" defaultValue={opening.status} className="input"><option value="open">Open</option><option value="on_hold">On hold</option><option value="closed">Closed</option></select></Field>
            </div>
            <Field label="Description"><textarea name="description" rows={5} defaultValue={opening.description ?? ""} className="input" /></Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Drawer>
      )}

      {cand && (
        <Drawer title={cand.name} closeHref={path} width="max-w-xl">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {(() => { const s = CANDIDATE_STAGES.find((x) => x.value === cand.stage)!; return <StatusPill name={s.label} colorName={s.color} />; })()}
              {cand.rating && <span className="text-gold-600">{"★".repeat(cand.rating)}</span>}
              {cand.expectedSalary && <span className="text-muted">Expects {fmtPKR(cand.expectedSalary)}</span>}
              {canEdit && <Link href={`${path}?editc=${cand.id}`} scroll={false} className="ml-auto text-xs text-muted hover:text-ink hover:underline">Edit</Link>}
            </div>
            <div className="flex flex-wrap gap-2">
              {cand.phone && <a href={telHref(cand.phone)} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-sm hover:bg-canvas"><Phone className="size-3.5" /> {fmtPhone(cand.phone)}</a>}
              {cand.email && <a href={`mailto:${cand.email}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-sm hover:bg-canvas"><Mail className="size-3.5" /> {cand.email}</a>}
              {cand.cv && <a href={fileUrl(cand.cv)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-sm hover:bg-canvas"><FileText className="size-3.5" /> CV</a>}
            </div>
            {cand.notes && <p className="whitespace-pre-line rounded-lg bg-canvas p-3 text-sm">{cand.notes}</p>}

            {canEdit && cand.stage !== "hired" && (
              <form action={setCandidateStage} className="flex flex-wrap gap-1.5">
                <input type="hidden" name="id" value={cand.id} />
                {CANDIDATE_STAGES.filter((s) => s.value !== "hired").map((s) => (
                  <button key={s.value} name="stage" value={s.value} disabled={cand.stage === s.value} className={cn("rounded-full border px-3 py-1 text-xs", cand.stage === s.value ? "border-navy-900 bg-navy-900 text-white" : "border-line text-muted hover:text-ink")}>{s.label}</button>
                ))}
              </form>
            )}

            <section>
              <h3 className="mb-2 text-sm font-medium">Interviews</h3>
              {cand.interviews.length === 0 && <p className="text-sm text-muted">None yet.</p>}
              <ul className="space-y-3">
                {cand.interviews.map((i) => (
                  <li key={i.id} className="rounded-lg border border-line p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{format(i.at, "EEE d MMM, h:mm a")}</span>
                      <Badge>{i.mode}</Badge>
                      <span className="text-muted">{users.find((u) => u.id === i.interviewerId)?.name ?? "—"}</span>
                      {i.outcome && <Badge tone={i.outcome === "pass" ? "green" : i.outcome === "fail" ? "red" : "amber"}>{i.outcome}</Badge>}
                    </div>
                    {canEdit ? (
                      <ActionForm action={saveFeedback} className="space-y-2">
                        <input type="hidden" name="id" value={i.id} />
                        <textarea name="feedback" rows={2} defaultValue={i.feedback ?? ""} className="input" placeholder="Feedback" aria-label="Feedback" />
                        <div className="flex gap-2">
                          <select name="outcome" defaultValue={i.outcome ?? ""} className="input w-36" aria-label="Outcome"><option value="">Outcome…</option><option value="pass">Pass</option><option value="hold">Hold</option><option value="fail">Fail</option></select>
                          <SubmitButton variant="secondary">Save</SubmitButton>
                        </div>
                      </ActionForm>
                    ) : i.feedback && <p className="text-sm">{i.feedback}</p>}
                  </li>
                ))}
              </ul>
              {canEdit && cand.stage !== "hired" && (
                <ActionForm action={scheduleInterview} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_1fr_auto]">
                  <input type="hidden" name="candidateId" value={cand.id} />
                  <input name="at" type="datetime-local" required className="input" aria-label="Date and time" />
                  <select name="mode" className="input" aria-label="Mode"><option value="onsite">On-site</option><option value="phone">Phone</option><option value="video">Video</option></select>
                  <select name="interviewerId" defaultValue={user.id} className="input" aria-label="Interviewer">{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                  <SubmitButton variant="secondary">Schedule</SubmitButton>
                </ActionForm>
              )}
            </section>

            {cand.stage === "hired" && cand.hiredEmployeeId && (
              <LinkButton href={`/hr/employees/${cand.hiredEmployeeId}`} variant="secondary">Open employee record</LinkButton>
            )}
            {canEdit && can(user, "hr.employees", "create") && ["offer", "interview"].includes(cand.stage) && (
              <section className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium"><UserPlus className="size-4" /> Hire {cand.name}</h3>
                <ActionForm action={hireCandidate} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <input type="hidden" name="id" value={cand.id} />
                  <Field label="Joining date"><input name="joiningDate" type="date" required defaultValue={format(new Date(), "yyyy-MM-dd")} className="input" /></Field>
                  <Field label="Designation"><select name="designationId" className="input"><option value="">—</option>{designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
                  <div className="flex items-end"><SubmitButton pendingText="Creating…">Hire</SubmitButton></div>
                </ActionForm>
                <p className="mt-2 text-xs text-muted">Creates the employee record (with CV and expected salary), starts onboarding, and opens it so you can complete the details.</p>
              </section>
            )}
          </div>
        </Drawer>
      )}
    </>
  );
}
