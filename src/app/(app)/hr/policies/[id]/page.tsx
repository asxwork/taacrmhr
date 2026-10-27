import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Download } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { audienceWhere } from "@/lib/policies";
import { fileUrl } from "@/lib/files";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { remindPolicy } from "../actions";
import { comingSoon } from "@/components/coming-soon";

export const metadata = { title: "Policy" };

export default async function PolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("hr.employees");
  const { id } = await params;
  const p = await db.policy.findUnique({ where: { id } });
  if (!p) return (await comingSoon(`/hr/policies/${id}`)) ?? notFound();
  const canManage = user.isSuperAdmin || scopeFor(user, "hr.employees", "edit") === "all";
  const people = await db.employee.findMany({
    where: audienceWhere(p),
    select: { id: true, fullName: true, photo: true, code: true, department: { select: { name: true } }, policyAcks: { where: { policyId: p.id, version: p.version }, select: { createdAt: true } } },
    orderBy: { fullName: "asc" },
  });
  const done = people.filter((e) => e.policyAcks.length);
  const pending = people.filter((e) => !e.policyAcks.length);

  return (
    <>
      <Link href="/hr/policies" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> Policy Documents</Link>
      <PageHeader title={p.title} description={`${p.category} · version ${p.version}${p.publishedAt ? ` · published ${format(p.publishedAt, "d MMM yyyy")}` : ""}`}
        actions={p.filePath && <a href={fileUrl(p.filePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm hover:bg-surface"><Download className="size-4" /> Open PDF</a>} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="p-6">
          {p.body ? <div className="whitespace-pre-line text-sm leading-relaxed">{p.body}</div> : <p className="text-sm text-muted">See the attached PDF.</p>}
        </Card>
        <div className="space-y-4">
          {p.requireAck && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Pending ({pending.length})</h2>
                {canManage && pending.length > 0 && (
                  <ActionForm action={remindPolicy}><input type="hidden" name="id" value={p.id} /><SubmitButton variant="secondary" className="h-8 text-xs" pendingText="Sending…">Remind all</SubmitButton></ActionForm>
                )}
              </div>
              <PeopleList rows={pending.map((e) => ({ e, right: <Badge tone="amber">pending</Badge> }))} empty="Everyone has acknowledged it." />
            </Card>
          )}
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Acknowledged ({done.length})</h2>
            <PeopleList rows={done.map((e) => ({ e, right: <span className="text-xs text-muted">{format(e.policyAcks[0]!.createdAt, "d MMM, h:mm a")}</span> }))} empty="Nobody yet." />
          </Card>
        </div>
      </div>
    </>
  );
}

function PeopleList({ rows, empty }: { rows: { e: { id: string; fullName: string; photo: string | null; code: string; department: { name: string } | null }; right: React.ReactNode }[]; empty: string }) {
  if (!rows.length) return <p className="py-4 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="max-h-96 divide-y divide-line overflow-y-auto">
      {rows.map(({ e, right }) => (
        <li key={e.id} className="flex items-center gap-3 py-2">
          <PersonAvatar name={e.fullName} photo={e.photo} />
          <Link href={`/hr/employees/${e.id}?tab=policies`} className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium hover:underline">{e.fullName}</span>
            <span className="block truncate text-xs text-muted">{e.code}{e.department ? ` · ${e.department.name}` : ""}</span>
          </Link>
          {right}
        </li>
      ))}
    </ul>
  );
}
