import Link from "next/link";
import { FileText } from "lucide-react";
import { db } from "@/lib/db";
import { EMPLOYMENT_TYPES, SELF_EDITABLE, empStatus } from "@/lib/hr-shared";
import { fileUrl } from "@/lib/files";
import { fmtDate } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field } from "@/components/ui";
import { InfoList, StatusPill } from "@/components/crm/bits";
import { DocumentForm } from "../hr/employees/forms";
import { requestProfileUpdate } from "./actions";

/** Self-service: the signed-in user's own employee record, documents and change requests. */
export async function MyEmployment({ userId }: { userId: string }) {
  const emp = await db.employee.findUnique({
    where: { userId },
    include: { department: true, designation: true, branch: true, manager: true, documents: { orderBy: { createdAt: "desc" } } },
  });
  if (!emp) return null;
  const pending = await db.approvalRequest.findFirst({ where: { employeeId: emp.id, type: "profile_update", status: "pending" } });
  const st = empStatus(emp.status);

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium">My employment</h2>
          <StatusPill name={st.label} colorName={st.color} />
        </div>
        <InfoList rows={[
          ["Employee code", emp.code],
          ["Designation", emp.designation?.name],
          ["Department", emp.department?.name],
          ["Branch", emp.branch?.name],
          ["Reports to", emp.manager?.fullName],
          ["Type", EMPLOYMENT_TYPES.find((t) => t.value === emp.employmentType)?.label],
          ["Joined", fmtDate(emp.joiningDate)],
          ...(emp.status === "probation" && emp.probationEnd ? [["Probation ends", fmtDate(emp.probationEnd)] as [string, string]] : []),
        ]} />
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 font-medium">My details</h2>
        <p className="mb-3 text-sm text-muted">Changes go to HR for approval before they’re saved.</p>
        {pending ? (
          <p className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            A change is waiting for HR. <Link href={`/approvals?tab=mine&open=${pending.id}`} className="font-medium underline">View request</Link>
          </p>
        ) : (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-navy-900">Request a change</summary>
            <ActionForm action={requestProfileUpdate} className="mt-3 grid gap-3 sm:grid-cols-2">
              {SELF_EDITABLE.map((f) => (
                <Field key={f.key} label={f.label} className={f.key === "address" ? "sm:col-span-2" : undefined}>
                  <input name={f.key} defaultValue={emp[f.key] ?? ""} className="input" />
                </Field>
              ))}
              <div className="sm:col-span-2"><SubmitButton>Send to HR</SubmitButton></div>
            </ActionForm>
          </details>
        )}
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
  );
}
