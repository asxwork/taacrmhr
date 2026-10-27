import Link from "next/link";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { POLICY_CATEGORIES } from "@/lib/policies";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { savePolicy, setPolicyStatus } from "../actions";

export const metadata = { title: "Policy Management" };

type SP = { new?: string; edit?: string };
const TONE = { draft: "neutral", published: "green", archived: "amber" } as const;

/** Settings → Policy Management: write or upload policies, choose who they apply to, publish new versions. */
export default async function PolicyManagePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("hr.employees");
  if (!(user.isSuperAdmin || scopeFor(user, "hr.employees", "edit") === "all")) redirect("/hr/policies");
  const sp = await searchParams;
  const [policies, branches, departments] = await Promise.all([
    db.policy.findMany({ orderBy: [{ status: "asc" }, { updatedAt: "desc" }] }),
    db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.department.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const editing = sp.edit ? policies.find((p) => p.id === sp.edit) : null;
  const picked = new Set((editing?.audienceIds ?? "").split(","));

  return (
    <>
      <PageHeader title="Policy Management" description="Write a policy or attach a PDF, choose who it applies to and publish. Changing a published policy can send it out again as a new version for everyone to acknowledge."
        actions={<LinkButton href="/hr/policies/manage?new=1" scroll={false}><Plus className="size-4" /> New policy</LinkButton>} />
      <Card className="overflow-x-auto">
        {policies.length === 0 ? <EmptyState title="No policies yet" description="Start with your code of conduct, leave policy and attendance rules." /> : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-2.5">Policy</th><th className="px-4 py-2.5">Applies to</th><th className="px-4 py-2.5">Version</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Updated</th><th className="px-4 py-2.5" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {policies.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5"><Link href={`/hr/policies/manage?edit=${p.id}`} scroll={false} className="font-medium hover:underline">{p.title}</Link><span className="block text-xs text-muted">{p.category}{p.filePath ? " · PDF" : ""}{p.requireAck ? " · needs acknowledgement" : ""}</span></td>
                  <td className="px-4 py-2.5 text-xs">{p.audience === "all" ? "Everyone" : `${(p.audienceIds ?? "").split(",").filter(Boolean).length} ${p.audience}`}</td>
                  <td className="px-4 py-2.5">v{p.version}</td>
                  <td className="px-4 py-2.5"><Badge tone={TONE[p.status as keyof typeof TONE] ?? "neutral"}>{p.status}</Badge></td>
                  <td className="px-4 py-2.5 text-xs text-muted">{format(p.updatedAt, "d MMM yyyy")}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      {p.status !== "published" && <StatusButton id={p.id} status="published" label="Publish" />}
                      {p.status === "published" && <StatusButton id={p.id} status="archived" label="Archive" />}
                      {p.status === "published" && <Link href={`/hr/policies/${p.id}`} className="rounded px-2 py-1 text-xs text-navy-700 hover:bg-canvas">Acknowledgements</Link>}
                      {p.status !== "published" && <StatusButton id={p.id} status="delete" label="Delete" danger />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {(sp.new || editing) && (
        <Drawer title={editing ? `Edit ${editing.title}` : "New policy"} closeHref="/hr/policies/manage" width="max-w-2xl">
          <ActionForm action={savePolicy} className="space-y-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
              <Field label="Title"><input name="title" required defaultValue={editing?.title} className="input" placeholder="e.g. Code of Conduct" /></Field>
              <Field label="Category"><select name="category" defaultValue={editing?.category ?? "General"} className="input">{POLICY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            </div>
            <Field label="Policy text" hint="Plain text; blank lines start new paragraphs. Or attach a PDF below (or both).">
              <textarea name="body" rows={12} defaultValue={editing?.body ?? ""} className="input font-mono text-xs" />
            </Field>
            <Field label={editing?.filePath ? "Replace PDF (optional)" : "PDF (optional)"}><input name="file" type="file" accept="application/pdf,image/jpeg,image/png" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" /></Field>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Applies to</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                {(["all", "branches", "departments"] as const).map((a) => (
                  <label key={a} className="flex items-center gap-2"><input type="radio" name="audience" value={a} defaultChecked={(editing?.audience ?? "all") === a} /> {a === "all" ? "Everyone" : a === "branches" ? "Selected branches" : "Selected departments"}</label>
                ))}
              </div>
              {([["branches", "branchIds", branches], ["departments", "departmentIds", departments]] as const).map(([a, name, list]) => (
                <div key={a} className="rounded-md border border-line px-3 py-2">
                  <p className="mb-1 text-xs text-muted">{a === "branches" ? "Branches" : "Departments"} (used when “Selected {a}” is chosen)</p>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {list.map((x) => <label key={x.id} className="flex items-center gap-1.5"><input type="checkbox" name={name} value={x.id} defaultChecked={editing?.audience === a && picked.has(x.id)} /> {x.name}</label>)}
                  </div>
                </div>
              ))}
            </fieldset>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requireAck" defaultChecked={editing?.requireAck ?? true} /> Employees must acknowledge it</label>
            {editing?.status === "published"
              ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="republish" /> Send changes out as version {editing.version + 1} (everyone acknowledges again)</label>
              : !editing && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publish" defaultChecked /> Publish now and notify employees</label>}
            <SubmitButton>{editing ? "Save" : "Add policy"}</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}

function StatusButton({ id, status, label, danger }: { id: string; status: string; label: string; danger?: boolean }) {
  return (
    <form action={setPolicyStatus}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} />
      <button className={danger ? "rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50" : "rounded px-2 py-1 text-xs text-navy-700 hover:bg-canvas"}>{label}</button>
    </form>
  );
}
