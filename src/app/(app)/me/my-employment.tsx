import Link from "next/link";
import { Camera, FileText, IdCard } from "lucide-react";
import { db } from "@/lib/db";
import { BLOOD_GROUPS, ID_DOCS, SELF_EDITABLE } from "@/lib/hr-shared";
import { loadProfile, profileOptions } from "@/lib/employee-profile";
import { ProfileView } from "@/components/hr/profile-view";
import { fileUrl } from "@/lib/files";
import { fmtDate } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Avatar, Badge, Card, Field } from "@/components/ui";
import { DocumentForm } from "../hr/employees/forms";
import { requestProfileUpdate, updateMyPhoto } from "./actions";
import { uploadDocument } from "../hr/employees/actions";

/** Self-service: the signed-in user's own employee record, documents and change requests. */
export async function MyEmployment({ userId }: { userId: string }) {
  const row = await db.employee.findUnique({ where: { userId }, select: { id: true } });
  const p = row ? await loadProfile(row.id) : null;
  if (!p) return null;
  const { emp } = p;
  const [pending, options] = await Promise.all([
    db.approvalRequest.findFirst({ where: { employeeId: emp.id, type: "profile_update", status: "pending" } }),
    profileOptions(),
  ]);

  const latest = (type: string) => emp.documents.find((d) => d.type === type);
  const fileInput = "block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white";

  return (
    <div className="mb-6">
      <ProfileView
        p={p} options={options} canEdit={false} canSalary={false} showSalary initialTab="info"
        banner={
          <div className="mb-5">
      <Card className="p-4">
        <h2 className="mb-1 font-medium">My details</h2>
        <p className="mb-3 text-sm text-muted">Changes go to HR for approval before they’re saved.</p>
        {pending ? (
          <p className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            A change is waiting for HR. <Link href={`/approvals?tab=mine&open=${pending.id}`} className="font-medium underline">View request</Link>
          </p>
        ) : (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-navy-900">Request a change</summary>
            <ActionForm action={requestProfileUpdate} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SELF_EDITABLE.map((f) => (
                <Field key={f.key} label={f.label} className={f.key === "address" ? "sm:col-span-2" : undefined}>
                  {f.key === "bloodGroup" ? (
                    <select name="bloodGroup" defaultValue={emp.bloodGroup ?? ""} className="input">
                      <option value="">—</option>
                      {BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}
                    </select>
                  ) : <input name={f.key} defaultValue={emp[f.key] ?? ""} className="input" placeholder={f.key === "cnic" ? "42101-1234567-1" : undefined} />}
                </Field>
              ))}
              <div className="sm:col-span-2"><SubmitButton>Send to HR</SubmitButton></div>
            </ActionForm>
          </details>
        )}
      </Card>

          </div>
        }
        docsTab={
          <div className="space-y-6">
      <Card className="p-6 lg:col-span-2">
        <h2 className="mb-1 font-medium">Photo &amp; ID</h2>
        <p className="mb-5 text-sm text-muted">Your photo is saved straight away. ID pictures go to HR to verify; numbers and blood group change through “Request a change”.</p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
          <div className="flex flex-col items-center gap-3 text-center">
            {emp.photo
              // eslint-disable-next-line @next/next/no-img-element -- user upload served from /api/files
              ? <img src={fileUrl(emp.photo)} alt={emp.fullName} className="size-28 rounded-full object-cover ring-4 ring-line" />
              : <Avatar name={emp.fullName} className="size-28 text-2xl" />}
            <ActionForm action={updateMyPhoto} className="w-full space-y-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-canvas">
                <Camera className="size-4" /> Choose photo
                <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required capture="user" className="sr-only" />
              </label>
              <SubmitButton className="w-full" pendingText="Uploading…">Save photo</SubmitButton>
            </ActionForm>
          </div>
          <div className="space-y-4">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              {([["Blood group", emp.bloodGroup], ["CNIC number", emp.cnic], ["Passport number", emp.passportNo]] as const).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-canvas/60 px-3 py-2">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="font-medium">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {ID_DOCS.map(({ type, label }) => {
                const doc = latest(type);
                return (
                  <div key={type} className="rounded-xl border border-line p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium"><IdCard className="size-4 text-muted" /> {label}</div>
                    {doc ? (
                      <a href={fileUrl(doc.path)} target="_blank" rel="noreferrer" className="mb-2 block">
                        {/\.(jpe?g|png|webp)$/i.test(doc.path)
                          // eslint-disable-next-line @next/next/no-img-element -- user upload served from /api/files
                          ? <img src={fileUrl(doc.path)} alt={label} className="h-24 w-full rounded-md object-cover" />
                          : <span className="flex h-24 items-center justify-center rounded-md bg-canvas text-xs text-muted"><FileText className="mr-1 size-4" /> PDF</span>}
                      </a>
                    ) : <p className="mb-2 flex h-24 items-center justify-center rounded-md bg-canvas text-xs text-muted">Not uploaded</p>}
                    {doc && <p className="mb-2 text-xs">{doc.verified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Awaiting HR</Badge>}{doc.expiresAt ? <span className="ml-1 text-muted">exp {fmtDate(doc.expiresAt)}</span> : null}</p>}
                    <ActionForm action={uploadDocument} className="space-y-2">
                      <input type="hidden" name="employeeId" value={emp.id} />
                      <input type="hidden" name="type" value={type} />
                      <input type="hidden" name="title" value={label} />
                      <input name="file" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" className={fileInput} aria-label={`${label} picture`} />
                      {type !== "CNIC (back)" && <input name="expiresAt" type="date" className="input h-8 text-xs" aria-label={`${label} expiry date`} title="Expiry date (optional)" />}
                      <SubmitButton variant="secondary" className="h-8 w-full text-xs" pendingText="Uploading…">{doc ? "Replace" : "Upload"}</SubmitButton>
                    </ActionForm>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 lg:col-span-2">
        <h2 className="mb-3 font-medium">My documents</h2>
        {emp.documents.length === 0 ? <p className="mb-4 text-sm text-muted">No documents on file.</p> : (
          <ul className="mb-4 divide-y divide-line">
            {emp.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <FileText className="size-4 text-muted" />
                <a href={fileUrl(d.path)} target="_blank" rel="noreferrer" className="font-medium hover:underline">{d.title}</a>
                <span className="text-xs text-muted">{d.type}{d.expiresAt ? ` · expires ${fmtDate(d.expiresAt)}` : ""}</span>
                <span className="flex-1" />
                {!d.verified && <Badge tone="amber">Awaiting HR</Badge>}
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-medium text-navy-900">Upload a document</summary>
          <div className="mt-3"><DocumentForm employeeId={emp.id} note="HR will verify it." /></div>
        </details>
      </Card>
          </div>
        }
      />
    </div>
  );
}
