import Link from "@/components/link";
import { differenceInCalendarDays, format } from "date-fns";
import { FileCheck2, FileText, Mail, Upload } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fileUrl } from "@/lib/files";
import { policiesFor } from "@/lib/policies";
import { DOC_TYPES } from "@/lib/hr-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { uploadDocument } from "@/app/(app)/hr/employees/actions";

export const metadata = { title: "My Documents" };

/** My Space → Documents: my files on record, letters HR issued me, and policies to read. */
export default async function MyDocumentsPage() {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!emp) return (<><PageHeader title="My Documents" /><Card><EmptyState title="No employee record" description="Ask HR to link your login to your employee profile." /></Card></>);
  const [docs, letters, policies] = await Promise.all([
    db.employeeDocument.findMany({ where: { employeeId: emp.id }, orderBy: { createdAt: "desc" } }),
    db.employeeLetter.findMany({ where: { employeeId: emp.id }, orderBy: { issuedAt: "desc" }, select: { id: true, title: true, issuedAt: true } }),
    policiesFor(emp.id),
  ]);
  const toSign = policies.filter((p) => p.requireAck && !p.ackAt).length;
  const today = new Date();

  return (
    <>
      <PageHeader title="My Documents" description="Your files on record with HR, letters issued to you, and company policies." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 font-medium"><FileText className="size-4 text-muted" /> My files <span className="text-sm font-normal text-muted">({docs.length})</span></h2>
            {docs.length === 0 ? <EmptyState title="No files yet" description="Upload your CNIC, degree or other papers on the right; HR checks them." /> : (
              <ul className="divide-y divide-line">
                {docs.map((d) => {
                  const days = d.expiresAt ? differenceInCalendarDays(d.expiresAt, today) : null;
                  return (
                    <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-canvas text-navy-900"><FileText className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <a href={fileUrl(d.path)} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">{d.title}</a>
                        <span className="block text-xs text-muted">{d.type} · added {format(d.createdAt, "d MMM yyyy")}{d.expiresAt ? ` · expires ${format(d.expiresAt, "d MMM yyyy")}` : ""}</span>
                      </span>
                      {days != null && days <= 30 && <Badge tone={days < 0 ? "red" : "amber"}>{days < 0 ? "Expired" : `${days} days left`}</Badge>}
                      <Badge tone={d.verified ? "green" : "amber"}>{d.verified ? "Checked by HR" : "Waiting for HR"}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card className="overflow-hidden">
            <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 font-medium"><Mail className="size-4 text-muted" /> Letters from HR <span className="text-sm font-normal text-muted">({letters.length})</span></h2>
            {letters.length === 0 ? <EmptyState title="No letters yet" description="Offer, experience and salary letters HR issues you appear here." /> : (
              <ul className="divide-y divide-line">
                {letters.map((l) => (
                  <li key={l.id}>
                    <a href={`/print/letter/${l.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-canvas/60">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-canvas text-navy-900"><Mail className="size-4" /></span>
                      <span className="flex-1 font-medium">{l.title}</span>
                      <span className="text-xs text-muted">{format(l.issuedAt, "d MMM yyyy")}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="p-4">
            <p className="mb-1 flex items-center gap-2 font-medium"><Upload className="size-4" /> Upload a document</p>
            <p className="mb-3 text-xs text-muted">PDF or photo, up to 10 MB. HR checks it before it counts.</p>
            <ActionForm action={uploadDocument} className="space-y-3">
              <input type="hidden" name="employeeId" value={emp.id} />
              <Field label="Type"><select name="type" className="input">{DOC_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
              <input name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" aria-label="File" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" />
              <SubmitButton pendingText="Uploading…">Upload</SubmitButton>
            </ActionForm>
          </Card>
          <Link href="/me/policies" className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm transition hover:shadow-md">
            <span className="flex size-10 items-center justify-center rounded-lg bg-canvas text-navy-900"><FileCheck2 className="size-5" /></span>
            <span className="flex-1"><span className="block font-medium">Company policies</span><span className="block text-xs text-muted">{policies.length} policies{toSign ? ` · ${toSign} to read and accept` : ""}</span></span>
            {toSign > 0 && <Badge tone="amber">{toSign}</Badge>}
          </Link>
        </div>
      </div>
    </>
  );
}
