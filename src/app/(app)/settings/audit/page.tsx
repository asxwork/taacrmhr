import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Audit Log" };

const TONE = { create: "green", update: "navy", delete: "red", login: "neutral", logout: "neutral" } as const;

export default async function AuditPage() {
  await requirePermission("settings.audit");
  const logs = await db.auditLog.findMany({ include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 });

  return (
    <>
      <PageHeader title="Audit Log" description="Who changed what, and when. Showing the latest 200 events." />
      <Card className="overflow-hidden">
        {logs.length === 0 ? (
          <EmptyState title="Nothing logged yet" />
        ) : (
          <ul className="divide-y divide-line">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <Badge tone={TONE[l.action as keyof typeof TONE] ?? "neutral"}>{l.action}</Badge>
                <span className="flex-1">{l.summary}</span>
                <span className="hidden text-muted sm:inline">{l.user?.name ?? "System"}</span>
                <span className="w-40 text-right text-xs text-muted">{fmtDateTime(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
