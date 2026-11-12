import { format } from "date-fns";
import { Laptop, Tag } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "My Assets" };
const LABEL: Record<string, string> = { assigned: "Given to you", returned: "Returned" };

/** My Space → Assets: company equipment I have now, and what I had before. */
export default async function MyAssetsPage() {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!emp) return (<><PageHeader title="My Assets" /><Card><EmptyState title="No employee record" description="Ask HR to link your login to your employee profile." /></Card></>);
  const [now, history] = await Promise.all([
    db.asset.findMany({ where: { assignedToId: emp.id }, orderBy: { assignedAt: "desc" } }),
    db.assetLog.findMany({ where: { employeeId: emp.id, action: { in: ["assigned", "returned"] } }, include: { asset: { select: { name: true, tag: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  return (
    <>
      <PageHeader title="My Assets" description="Company equipment you have. Something missing or wrong? Tell HR." />
      {now.length === 0 ? <Card className="mb-6"><EmptyState title="Nothing assigned to you" description="Laptops, phones, SIMs and other company items HR gives you show here." /></Card> : (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {now.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-navy-900 text-white"><Laptop className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{a.name}</p>
                  <p className="text-xs text-muted">{a.category} · {a.tag}</p>
                </div>
              </div>
              <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                {a.serial && <div className="flex justify-between gap-2"><dt className="text-muted">Serial</dt><dd className="truncate">{a.serial}</dd></div>}
                <div className="flex justify-between gap-2"><dt className="text-muted">Since</dt><dd>{a.assignedAt ? format(a.assignedAt, "d MMM yyyy") : "—"}</dd></div>
              </dl>
              {a.tags && <div className="mt-2 flex flex-wrap gap-1">{a.tags.split(",").map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-800"><Tag className="size-3" />{t}</span>)}</div>}
            </Card>
          ))}
        </div>
      )}
      {history.length > 0 && (
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 font-medium">History</h2>
          <ul className="divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className={h.action === "assigned" ? "text-emerald-700" : "text-muted"}>{LABEL[h.action]}</span>
                <span className="flex-1 font-medium">{h.asset.name} <span className="text-xs font-normal text-muted">{h.asset.tag}</span></span>
                <span className="text-xs text-muted">{format(h.createdAt, "d MMM yyyy")}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
