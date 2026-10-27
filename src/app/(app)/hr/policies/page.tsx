import Link from "next/link";
import { format } from "date-fns";
import { FileCheck2, Settings2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { ackProgress } from "@/lib/policies";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Policy Documents" };

/** Compliance → Policy Documents: every published policy with how many people have acknowledged it. */
export default async function PoliciesPage() {
  const user = await requirePermission("hr.employees");
  const canManage = user.isSuperAdmin || scopeFor(user, "hr.employees", "edit") === "all";
  const policies = await db.policy.findMany({ where: { status: "published" }, orderBy: [{ category: "asc" }, { title: "asc" }] });
  const progress = await ackProgress(policies);

  return (
    <>
      <PageHeader title="Policy Documents" description="Published policies and who has read and acknowledged the current version."
        actions={canManage && <LinkButton href="/hr/policies/manage" variant="secondary"><Settings2 className="size-4" /> Policy Management</LinkButton>} />
      {policies.length === 0 ? (
        <Card><EmptyState title="No published policies yet" description={canManage ? "Add and publish them in Policy Management." : undefined} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {policies.map((p) => {
            const pr = progress.get(p.id) ?? { done: 0, total: 0 };
            const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
            return (
              <Link key={p.id} href={`/hr/policies/${p.id}`} className="group">
                <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-navy-900/5 text-navy-700"><FileCheck2 className="size-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium group-hover:underline">{p.title}</p>
                      <p className="text-xs text-muted">{p.category} · v{p.version} · published {p.publishedAt ? format(p.publishedAt, "d MMM yyyy") : "—"}</p>
                    </div>
                    {p.audience !== "all" && <Badge tone="navy">{p.audience === "branches" ? "Some branches" : "Some departments"}</Badge>}
                  </div>
                  {p.requireAck ? (
                    <>
                      <div className="mb-1 flex justify-between text-xs"><span className="text-muted">Acknowledged</span><span className="font-medium tabular-nums">{pr.done}/{pr.total} · {pct}%</span></div>
                      <div className="h-2 rounded-full bg-canvas"><div className={pct === 100 ? "h-full rounded-full bg-emerald-500" : "h-full rounded-full bg-amber-500"} style={{ width: `${pct}%` }} /></div>
                    </>
                  ) : <p className="text-xs text-muted">For information; no acknowledgement needed.</p>}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
