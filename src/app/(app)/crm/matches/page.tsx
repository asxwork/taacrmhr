import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { MessageCircle, X } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeWhere } from "@/lib/permissions";
import { fieldAccess } from "@/lib/field-rules";
import { fmtPKR, waHref } from "@/lib/crm-shared";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { dismissMatch } from "./actions";

export const metadata = { title: "Property matches" };

/** Leads → Matches: units that fit open leads, found when a unit is added or becomes available. */
export default async function MatchesPage() {
  const user = await requirePermission("crm.matches");
  const scope = (await scopeWhere(user, "crm.matches"))!;
  const [matches, fields] = await Promise.all([
    db.propertyMatch.findMany({
      where: { dismissedAt: null, lead: { ...scope, status: { kind: "open" } }, unit: { status: "available" } },
      include: {
        lead: { select: { id: true, name: true, phone: true, owner: { select: { name: true } } } },
        unit: { select: { id: true, unitNo: true, type: true, price: true, purpose: true, project: { select: { name: true } } } },
      },
      orderBy: [{ createdAt: "desc" }, { score: "desc" }],
      take: 150,
    }),
    fieldAccess(user),
  ]);
  const showPhone = fields["lead.phone"] === "full";

  return (
    <>
      <PageHeader title="Property matches" description="When a unit is added or becomes available, AMS checks it against open leads (project, type, budget, area) and tells the agent." />
      <Card className="overflow-hidden">
        {matches.length === 0 ? <EmptyState title="No matches right now" description="New matches appear here (and as a notification) when a unit fits one of your leads." /> : (
          <ul className="divide-y divide-line">
            {matches.map((m) => {
              const unit = `${m.unit.project?.name ? `${m.unit.project.name} · ` : ""}${m.unit.unitNo}`;
              const text = `Hi ${m.lead.name.split(" ")[0]}, a ${m.unit.type.toLowerCase()} you may like just became available: ${unit}${m.unit.price ? ` at ${fmtPKR(m.unit.price)}` : ""}. Shall I share details?`;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Badge tone={m.score >= 70 ? "green" : "amber"}>{m.score}%</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm"><Link href={`/crm/leads/${m.lead.id}`} className="font-medium text-navy-900 hover:underline">{m.lead.name}</Link>
                      <span className="text-muted"> ↔ </span><Link href={`/inventory/units/${m.unit.id}`} className="font-medium hover:underline">{unit}</Link></p>
                    <p className="truncate text-xs text-muted">{m.why}{m.unit.price ? ` · ${fmtPKR(m.unit.price)}${m.unit.purpose === "rent" ? "/mo" : ""}` : ""}{m.lead.owner ? ` · ${m.lead.owner.name}` : ""} · {formatDistanceToNowStrict(m.createdAt, { addSuffix: true })}</p>
                  </div>
                  {showPhone && m.lead.phone && (
                    <a href={`${waHref(m.lead.phone)}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700">
                      <MessageCircle className="size-4" /> Offer on WhatsApp
                    </a>
                  )}
                  <form action={dismissMatch}><input type="hidden" name="id" value={m.id} />
                    <button title="Dismiss" aria-label="Dismiss" className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-red-600"><X className="size-4" /></button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
