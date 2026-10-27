import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, requirePermission, scopeFor } from "@/lib/permissions";
import { assignableUsers, usersInScope } from "@/lib/crm";
import { filtersFrom, loadLeadList } from "@/lib/lead-list";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Drawer, Field } from "@/components/ui";
import { LeadsWorkspace } from "@/components/crm/leads-workspace";
import type { FilterPreset } from "@/components/crm/lead-filter-bar";
import { hrefWith } from "@/components/crm/bits";
import { describe, parseConfig } from "@/lib/automations";
import { importLeads, importLeadsFull } from "./actions";

export const metadata = { title: "Leads" };

type SP = Record<string, string | undefined>;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("crm.leads");
  const sp = await searchParams;
  if (sp.new) redirect("/crm/leads/new");
  const view = sp.view === "board" ? "board" : "list";
  const page = Math.max(1, Number(sp.page) || 1);
  const filters = filtersFrom(sp);

  const [statuses, sources, projects, owners, assignees, saved, automations, initial] = await Promise.all([
    db.leadStatus.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.leadSource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    usersInScope(user, "crm.leads", "view"),
    assignableUsers(user, "crm.leads"),
    db.savedFilter.findMany({ where: { userId: user.id, module: "crm.leads" }, orderBy: { createdAt: "asc" } }),
    db.automation.findMany({ where: { active: true, entity: "lead" }, orderBy: { name: "asc" } }),
    loadLeadList(user, filters, view, page),
  ]);

  const presets: FilterPreset[] = [
    { name: "Leads in progress", query: "" },
    { name: "My leads", query: "owner=me" },
    { name: "Today's leads", query: "created=today&group=all" },
    { name: "Yesterday's leads", query: "created=yesterday&group=all" },
    { name: "Not contacted 7+ days", query: "stale=7" },
    { name: "Overdue activities", query: "activity=overdue" },
    { name: "Reshuffled", query: "reshuffled=1" },
    { name: "Completed (converted)", query: "group=converted" },
    { name: "Not interested / not valid", query: "group=junk" },
    ...saved.map((s) => ({ id: s.id, name: s.name, query: s.query })),
    ...sources.map((s) => ({ name: s.name, query: `source=${s.id}` })),
    ...projects.map((p) => ({ name: p.name, query: `project=${p.id}` })),
  ];

  // Active automations, described in plain words for the run confirmation.
  const automationOptions = automations.map((a) => {
    const c = parseConfig(a.config);
    return {
      id: a.id, name: a.name, assign: c.assign, userIds: c.userIds, deletes: c.deleteHistory || c.deleteOpen,
      steps: describe(c, { stage: statuses.find((st) => st.id === c.stageId)?.name, users: assignees.filter((u) => c.userIds.includes(u.id)).map((u) => u.name) }),
    };
  });
  const canCreate = can(user, "crm.leads", "create");
  const canAssign = assignees.length > 1;
  const closeHref = hrefWith("/crm/leads", { ...filters, view: sp.view, page: sp.page }, {});

  return (
    <>
      <LeadsWorkspace
        key={JSON.stringify({ filters, view, page })}
        initial={initial}
        initialFilters={filters}
        initialView={view}
        presets={presets}
        filterOptions={{ stages: statuses.map((s) => ({ id: s.id, name: s.name })), sources, projects, owners }}
        stages={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind, systemKey: s.systemKey }))}
        assignees={assignees.map((u) => ({ id: u.id, name: u.name }))}
        automations={automationOptions}
        perms={{
          canCreate,
          canEdit: can(user, "crm.leads", "edit"),
          canDelete: can(user, "crm.leads", "delete"),
          canExport: can(user, "crm.leads", "export"),
          canAssign,
          canAddActivity: can(user, "crm.activities", "create"),
          isSuperAdmin: user.isSuperAdmin,
        }}
      />

      {sp.import && canCreate && (
        <Drawer title="Import leads" closeHref={closeHref}>
          <ActionForm action={importLeads} className="space-y-4">
            <p className="text-sm text-muted">
              Upload a <b className="font-medium text-ink">CSV</b> (from Excel: <i>File → Save As → CSV</i>). First row = headers. Recognised columns:{" "}
              <span className="text-ink">name, phone, email, source, campaign, interest, property type, location, budget, notes</span>.
            </p>
            <Field label="CSV file">
              <input name="file" type="file" accept=".csv,text/csv" required className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" />
            </Field>
            <Field label="Source (when the file has none)">
              <select name="sourceId" className="input" defaultValue="">
                <option value="">—</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            {canAssign && (
              <fieldset className="min-w-0 space-y-2">
                <legend className="mb-1.5 text-xs font-medium text-ink/80">Assign to</legend>
                <select name="assign" className="input" defaultValue={user.id}>
                  {assignees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  <option value="rr">Round-robin across selected people ↓</option>
                </select>
                <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-line p-2.5">
                  {assignees.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="rr" value={u.id} className="accent-navy-900" /> {u.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="skipDuplicates" defaultChecked className="accent-navy-900" /> Skip rows whose phone already exists
            </label>
            <SubmitButton pendingText="Importing…">Import</SubmitButton>
          </ActionForm>

          {(user.isSuperAdmin || scopeFor(user, "crm.leads", "edit") === "all") && (
            <ActionForm action={importLeadsFull} className="mt-8 space-y-4 border-t border-line pt-6">
              <div>
                <h3 className="font-medium">Restore from Excel (with activities)</h3>
                <p className="mt-1 text-sm text-muted">
                  Upload a file from <b className="font-medium text-ink">Export → Excel with activities</b>, edited or not. Leads whose ID already exists are updated,
                  new IDs are created with the same number, and activities are added (ones already here are skipped, so importing twice is safe).
                </p>
              </div>
              <Field label="Excel file (.xlsx)">
                <input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" />
              </Field>
              <SubmitButton pendingText="Importing…" variant="secondary">Import with activities</SubmitButton>
            </ActionForm>
          )}
        </Drawer>
      )}
    </>
  );
}
