import Link from "next/link";
import { ArrowLeft, Info, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { assignableUsers } from "@/lib/crm";
import { unitOptions } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui";
import { LeadForm } from "../lead-form";

export const metadata = { title: "New lead" };

/** Full-page create, laid out like the lead page: stages on top, the form on the left, the (empty) timeline on the right. */
export default async function NewLeadPage() {
  const user = await requirePermission("crm.leads", "create");
  const [stages, sources, projects, owners, units] = await Promise.all([
    db.leadStatus.findMany({ where: { active: true, kind: "open" }, orderBy: { sortOrder: "asc" } }),
    db.leadSource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    assignableUsers(user, "crm.leads"),
    unitOptions(user),
  ]);

  return (
    <>
      <Link href="/crm/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Leads
      </Link>
      <h1 className="mb-4 font-display text-2xl font-semibold tracking-tight sm:text-[28px]">New lead</h1>

      {/* Stages preview (the starting stage is chosen in the form) */}
      <div className="mb-6 flex overflow-x-auto rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-hidden>
        {[...stages.map((s) => s.name), "Complete lead"].map((name, i, all) => (
          <span key={name} className={cn(
            "min-w-28 flex-1 truncate bg-black/5 px-5 py-2.5 text-[13px] font-medium text-muted",
            i === 0 ? "rounded-l-lg [clip-path:polygon(0_0,calc(100%-8px)_0,100%_50%,calc(100%-8px)_100%,0_100%)]"
              : i === all.length - 1 ? "-ml-1 rounded-r-lg [clip-path:polygon(0_0,100%_0,100%_100%,0_100%,8px_50%)]"
              : "-ml-1 [clip-path:polygon(0_0,calc(100%-8px)_0,100%_50%,calc(100%-8px)_100%,0_100%,8px_50%)]",
          )}>{name}</span>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider">Lead information</h2>
            <Link href="/crm/leads" className="text-sm text-muted hover:text-ink">cancel</Link>
          </div>
          <LeadForm sources={sources} projects={projects} units={units} owners={owners} stages={stages} currentUserId={user.id} cancelHref="/crm/leads" />
        </Card>

        <div className="relative space-y-3 before:absolute before:inset-y-0 before:left-[19px] before:w-px before:bg-line">
          <div className="relative pl-14">
            <span className="absolute left-0 top-2 flex size-10 items-center justify-center rounded-full bg-emerald-600 text-white ring-4 ring-canvas"><Info className="size-4" /></span>
            <div className="flex items-center gap-3 rounded-xl border border-gold-300/50 bg-gold-100/50 px-4 py-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Plus className="size-4" /></span>
              <span>
                <span className="block text-sm font-medium">Add a new activity</span>
                <span className="block text-xs text-muted">Once the lead is saved, plan your next step here so the client is never forgotten.</span>
              </span>
            </div>
          </div>
          <div className="relative flex items-center pl-14">
            <span className="h-px flex-1 bg-line" />
            <span className="mx-3 rounded-full bg-navy-900 px-3 py-0.5 text-xs font-medium text-white">Today</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="relative pl-14">
            <span className="absolute left-0 top-0 flex size-10 items-center justify-center rounded-full bg-navy-900 text-white ring-4 ring-canvas"><Info className="size-4" /></span>
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">You are now adding a lead…</p>
          </div>
        </div>
      </div>
    </>
  );
}
