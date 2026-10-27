import Link from "next/link";
import { format } from "date-fns";
import { Eye, FilePlus2, Plus, Printer, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { employeeWhere } from "@/lib/hr";
import { LETTER_CATEGORIES, PLACEHOLDERS, fillTemplate, letterValues } from "@/lib/letters";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { deleteLetter, issueLetter, saveTemplate, toggleTemplate } from "./actions";

export const metadata = { title: "Letter Management" };

type SP = { tab?: string; emp?: string; tpl?: string; edit?: string; new?: string; issued?: string };
const catLabel = (v: string) => LETTER_CATEGORIES.find((c) => c.value === v)?.label ?? v;

/** Letter Management: generate letters from templates for an employee, keep what was issued, edit templates. */
export default async function LettersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("hr.employees");
  const sp = await searchParams;
  const canEdit = can(user, "hr.employees", "edit");
  const tab = sp.tab === "issued" || sp.tab === "templates" ? sp.tab : canEdit ? "generate" : "issued";
  const scope = (await employeeWhere(user)) ?? { id: "none" };
  const [templates, staff, issued] = await Promise.all([
    db.letterTemplate.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.employee.findMany({ where: scope, select: { id: true, fullName: true, code: true, status: true }, orderBy: { fullName: "asc" } }),
    tab === "issued" ? db.employeeLetter.findMany({ where: { employee: scope }, include: { employee: { select: { id: true, fullName: true, code: true } } }, orderBy: { issuedAt: "desc" }, take: 300 }) : [],
  ]);
  const tpl = sp.tpl ? templates.find((t) => t.id === sp.tpl) : null;
  const emp = sp.emp ? staff.find((e) => e.id === sp.emp) : null;
  const filled = tpl && emp ? fillTemplate(tpl.body, await letterValues(emp.id, user.name)) : null;
  const editing = sp.edit ? templates.find((t) => t.id === sp.edit) : null;
  const tabs = [...(canEdit ? [["generate", "Generate letter"]] : []), ["issued", "Issued letters"], ...(canEdit ? [["templates", `Templates (${templates.length})`]] : [])] as [string, string][];

  return (
    <>
      <PageHeader title="Letter Management" description="Experience letters, salary certificates, appointment and warning letters: filled in from the employee record, saved on their profile and printable on the letterhead." />
      <div className="mb-5 flex gap-1 border-b border-line">
        {tabs.map(([t, label]) => (
          <Link key={t} href={`/hr/letters?tab=${t}`} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === t ? "border-navy-900 font-medium" : "border-transparent text-muted hover:text-ink")}>{label}</Link>
        ))}
      </div>

      {tab === "generate" && (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card className="h-fit p-5">
            <h2 className="mb-3 text-sm font-semibold">1. Choose</h2>
            <AutoFilterForm className="space-y-3">
              <input type="hidden" name="tab" value="generate" />
              <Field label="Employee">
                <select name="emp" defaultValue={sp.emp ?? ""} className="input">
                  <option value="">Choose…</option>
                  {staff.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.code}){e.status === "left" ? " · left" : ""}</option>)}
                </select>
              </Field>
              <Field label="Letter">
                <select name="tpl" defaultValue={sp.tpl ?? ""} className="input">
                  <option value="">Choose…</option>
                  {templates.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
            </AutoFilterForm>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">2. Check, edit and issue</h2>
            {filled && tpl && emp ? (
              <ActionForm key={`${emp.id}-${tpl.id}`} action={issueLetter} className="space-y-3">
                <input type="hidden" name="employeeId" value={emp.id} />
                <input type="hidden" name="templateId" value={tpl.id} />
                <Field label="Title"><input name="title" required defaultValue={`${tpl.name} · ${emp.fullName}`} className="input" /></Field>
                <textarea name="body" rows={20} required defaultValue={filled} className="input font-serif text-sm leading-relaxed" aria-label="Letter text" />
                <p className="text-xs text-muted">Replace anything in [square brackets] before issuing. The employee sees issued letters in My Documents.</p>
                <SubmitButton><FilePlus2 className="size-4" /> Issue letter</SubmitButton>
              </ActionForm>
            ) : <EmptyState title="Choose an employee and a letter" description="The template is filled in from their record; you can edit the text before issuing." />}
          </Card>
        </div>
      )}

      {tab === "issued" && (
        <Card className="overflow-x-auto">
          {issued.length === 0 ? <EmptyState title="No letters issued yet" /> : (
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Letter</th><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5">Issued</th><th className="px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-line">
                {issued.map((l) => (
                  <tr key={l.id} className={cn(sp.issued === l.id && "bg-emerald-500/5")}>
                    <td className="px-4 py-2.5 font-medium">{l.title}</td>
                    <td className="px-4 py-2.5"><Link href={`/hr/employees/${l.employee.id}?tab=documents`} className="hover:underline">{l.employee.fullName}</Link> <span className="text-xs text-muted">{l.employee.code}</span></td>
                    <td className="px-4 py-2.5 text-xs text-muted">{format(l.issuedAt, "d MMM yyyy, h:mm a")}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <a href={`/print/letter/${l.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-navy-700 hover:bg-canvas"><Printer className="size-3.5" /> Print</a>
                        {canEdit && <form action={deleteLetter}><input type="hidden" name="id" value={l.id} /><button aria-label="Delete letter" title="Delete" className="rounded p-1 text-muted hover:text-red-600"><Trash2 className="size-3.5" /></button></form>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "templates" && canEdit && (
        <>
          <div className="mb-4 flex justify-end"><LinkButton href="/hr/letters?tab=templates&new=1" scroll={false}><Plus className="size-4" /> New template</LinkButton></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => (
              <Card key={t.id} className={cn("flex flex-col p-5", !t.active && "opacity-60")}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="font-medium">{t.name}</p>
                  <Badge tone={t.active ? "navy" : "neutral"}>{catLabel(t.category)}</Badge>
                </div>
                <p className="mb-4 line-clamp-4 flex-1 whitespace-pre-line text-xs text-muted">{t.body}</p>
                <div className="flex gap-2">
                  <LinkButton href={`/hr/letters?tab=templates&edit=${t.id}`} variant="secondary" scroll={false} className="h-8 text-xs"><Eye className="size-3.5" /> Edit</LinkButton>
                  <form action={toggleTemplate}><input type="hidden" name="id" value={t.id} /><button className="h-8 rounded-md px-3 text-xs text-muted hover:bg-canvas">{t.active ? "Hide" : "Show"}</button></form>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {canEdit && (sp.new || editing) && (
        <Drawer title={editing ? `Edit ${editing.name}` : "New letter template"} closeHref="/hr/letters?tab=templates" width="max-w-3xl">
          <ActionForm action={saveTemplate} className="space-y-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
              <Field label="Name"><input name="name" required defaultValue={editing?.name} className="input" /></Field>
              <Field label="Type"><select name="category" defaultValue={editing?.category ?? "other"} className="input">{LETTER_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
            </div>
            <textarea name="body" rows={18} required defaultValue={editing?.body ?? ""} className="input font-mono text-xs" aria-label="Template text" />
            <div className="rounded-md bg-canvas/60 p-3">
              <p className="mb-2 text-xs font-medium">Placeholders</p>
              <div className="flex flex-wrap gap-1.5">
                {PLACEHOLDERS.map(([k, label]) => <code key={k} title={label} className="rounded bg-surface px-1.5 py-0.5 text-[11px]">{`{{${k}}}`}</code>)}
              </div>
            </div>
            <SubmitButton>Save template</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
