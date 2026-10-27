import { format } from "date-fns";
import { CheckCircle2, Download, FileCheck2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { policiesFor } from "@/lib/policies";
import { fileUrl } from "@/lib/files";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { acknowledgePolicy } from "../../hr/policies/actions";

export const metadata = { title: "My Policies" };

/** My Space → My Policies: read each company policy and acknowledge it. */
export default async function MyPoliciesPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const user = await requireUser();
  const { open } = await searchParams;
  const emp = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!emp) return (<><PageHeader title="My Policies" /><Card><EmptyState title="No employee record" description="Ask HR to link your login to your employee profile." /></Card></>);
  const policies = await policiesFor(emp.id);
  const pending = policies.filter((p) => p.requireAck && !p.ackAt);

  return (
    <>
      <PageHeader title="My Policies" description={pending.length ? `${pending.length} polic${pending.length === 1 ? "y needs" : "ies need"} your acknowledgement.` : "You're up to date with every company policy."} />
      {policies.length === 0 ? <Card><EmptyState title="No policies published yet" /></Card> : (
        <div className="space-y-3">
          {policies.map((p) => (
            <details key={p.id} open={open === p.id || (!open && p.requireAck && !p.ackAt && pending[0]?.id === p.id)} className="group">
              <summary className="list-none">
                <Card className={cn("flex cursor-pointer items-center gap-3 p-4", p.requireAck && !p.ackAt && "border-amber-300")}>
                  <FileCheck2 className="size-5 shrink-0 text-navy-700" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-muted">{p.category} · version {p.version}{p.publishedAt ? ` · ${format(p.publishedAt, "d MMM yyyy")}` : ""}</p>
                  </div>
                  {!p.requireAck ? <Badge tone="neutral">for information</Badge> : p.ackAt ? <Badge tone="green">acknowledged {format(p.ackAt, "d MMM")}</Badge> : <Badge tone="amber">please acknowledge</Badge>}
                </Card>
              </summary>
              <Card className="-mt-1 rounded-t-none border-t-0 p-5">
                {p.body && <div className="mb-4 max-h-[60vh] overflow-y-auto whitespace-pre-line text-sm leading-relaxed">{p.body}</div>}
                {p.filePath && <a href={fileUrl(p.filePath)} target="_blank" rel="noreferrer" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:underline"><Download className="size-4" /> Open the policy document</a>}
                {p.requireAck && (p.ackAt ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="size-4" /> You acknowledged this version on {format(p.ackAt, "d MMM yyyy, h:mm a")}.</p>
                ) : (
                  <form action={acknowledgePolicy} className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                    <input type="hidden" name="id" value={p.id} />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" required /> I have read and understood this policy.</label>
                    <Button>Acknowledge</Button>
                  </form>
                ))}
              </Card>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
