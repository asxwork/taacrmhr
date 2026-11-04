import Link from "next/link";
import { FileText, IdCard } from "lucide-react";
import { db } from "@/lib/db";
import { ID_DOCS } from "@/lib/hr-shared";
import { loadProfile, profileOptions } from "@/lib/employee-profile";
import { ProfileView } from "@/components/hr/profile-view";
import { fileUrl } from "@/lib/files";
import { fmtDate } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card } from "@/components/ui";
import { DocumentForm } from "../hr/employees/forms";
import { uploadDocument } from "../hr/employees/actions";
import { SafeImg } from "@/components/safe-img";

/** Self-service: the signed-in user's own employee record, documents and change requests. */
export async function MyEmployment({ userId, tab }: { userId: string; tab?: string }) {
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
        p={p} options={options} canEdit={false} canSalary={false} showSalary initialTab={tab ?? "info"}
        self
        banner={
          <p className="mb-4 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-muted">
            Edit your picture and details right here. Personal, contact and address changes save straight away; CNIC, passport and licence changes go to HR for approval.
            {pending && <> A change is waiting for HR — <Link href={`/approvals?tab=mine&open=${pending.id}`} className="font-medium text-navy-900 underline">view request</Link>.</>}
          </p>
        }
        docsTab={
          <div className="space-y-6">
      <Card className="p-6 lg:col-span-2">
        <h2 className="mb-1 font-medium">ID pictures</h2>
        <p className="mb-5 text-sm text-muted">Pictures of your ID cards go to HR to verify. Change the numbers on the Overview tab.</p>
        <div>
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
                           
                          ? <SafeImg src={fileUrl(doc.path)} alt={label} className="h-24 w-full rounded-md object-cover" />
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
