"use client";

// Building blocks of the employee profile: the tab strip (switches in place, keeps ?tab= in the URL), the
// label-left / field-right section form, and the small tables used by Relatives, Qualifications, Banks and Assets.
import { useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import type { OptionSource, ProfileField, ProfileSectionDef } from "@/lib/profile-fields";
import type { FormState } from "@/lib/utils";

export type ProfileTab = { key: string; label: string; count?: number; content: React.ReactNode };

export function ProfileTabs({ tabs, initial }: { tabs: ProfileTab[]; initial: string }) {
  const [active, setActive] = useState(tabs.some((t) => t.key === initial) ? initial : tabs[0]!.key);
  const pick = (key: string) => {
    setActive(key);
    const url = new URL(window.location.href);
    if (key === tabs[0]!.key) url.searchParams.delete("tab"); else url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
  };
  return (
    <>
      <div className="sticky top-0 z-10 -mx-1 mb-5 overflow-x-auto bg-canvas/95 px-1 py-2 backdrop-blur">
        <div className="flex min-w-max gap-1" role="tablist">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={active === t.key} onClick={() => pick(t.key)}
              className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition", active === t.key ? "bg-navy-900 font-medium text-white" : "text-muted hover:bg-surface hover:text-ink")}>
              {t.label}{t.count ? <span className={cn("ml-1.5 text-xs", active === t.key ? "text-white/70" : "text-muted")}>{t.count}</span> : null}
            </button>
          ))}
        </div>
      </div>
      {tabs.map((t) => <div key={t.key} hidden={active !== t.key} role="tabpanel">{t.content}</div>)}
    </>
  );
}

/** A section heading with a rule, as in ResourceInn's profile. */
export function SectionTitle({ icon, children, action }: { icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-1 mt-6 flex items-center gap-2 border-b border-line pb-2 first:mt-0">
      {icon}
      <h2 className="flex-1 text-sm font-semibold">{children}</h2>
      {action}
    </div>
  );
}

/** One label / value row. */
export function Row({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-1 px-3 py-2 odd:bg-surface/60 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
      <span className="text-xs font-semibold text-ink/80">{label}{required && <span className="text-red-500"> *</span>}</span>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

const display = (f: ProfileField, v: string, options: Partial<Record<OptionSource, [string, string][]>>) => {
  if (!v) return <span className="text-muted">—</span>;
  if (f.kind === "bool") return v ? "Yes" : "No";
  if (f.kind === "date") return format(new Date(`${v}T00:00:00`), "MMMM d, yyyy");
  if (f.kind === "select") return (f.source ? options[f.source] : f.options)?.find(([k]) => k === v)?.[1] ?? v;
  if (f.kind === "number") return Number(v).toLocaleString("en-PK");
  return v;
};

/**
 * A profile section as rows. Editors get inputs and a Save button (one server action per section); everyone else
 * sees plain values. `before`/`after` add custom rows such as the photo or ID attachments.
 */
export function SectionForm({ employeeId, def, values, options, canEdit, action, title, icon, before, after }: {
  employeeId: string; def: ProfileSectionDef; values: Record<string, string>; options: Partial<Record<OptionSource, [string, string][]>>;
  canEdit: boolean; action: (s: FormState, fd: FormData) => Promise<FormState>; title?: string; icon?: React.ReactNode;
  before?: React.ReactNode; after?: React.ReactNode;
}) {
  const rows = def.fields.map((f) => (
    <Row key={f.key} label={f.label} required={f.required && canEdit && !f.readOnly}>
      {canEdit && !f.readOnly ? <Input f={f} value={values[f.key] ?? ""} options={options} /> : display(f, values[f.key] ?? "", options)}
    </Row>
  ));
  return (
    <section>
      <SectionTitle icon={icon}>{title ?? def.title}</SectionTitle>
      {before}
      {canEdit ? (
        <ActionForm action={action}>
          <input type="hidden" name="id" value={employeeId} />
          <input type="hidden" name="section" value={def.key} />
          {rows}
          {after}
          <div className="flex justify-end px-3 pt-3"><SubmitButton variant="secondary">Save {(title ?? def.title).toLowerCase()}</SubmitButton></div>
        </ActionForm>
      ) : (
        <>{rows}{after}</>
      )}
    </section>
  );
}

function Input({ f, value, options }: { f: ProfileField; value: string; options: Partial<Record<OptionSource, [string, string][]>> }) {
  const base = "input h-9";
  if (f.kind === "bool") {
    return (
      <label className="inline-flex cursor-pointer items-center gap-2">
        <input type="checkbox" name={f.key} defaultChecked={!!value} className="peer sr-only" />
        <span className="relative h-5 w-9 rounded-full bg-line transition after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:transition peer-checked:bg-navy-900 peer-checked:after:translate-x-4" />
      </label>
    );
  }
  if (f.kind === "select") {
    const opts = f.source ? options[f.source] ?? [] : f.options ?? [];
    return (
      <select name={f.key} defaultValue={value} required={f.required} className={base} aria-label={f.label}>
        <option value="">{`Select ${f.label.replace(/\?$/, "")}`}</option>
        {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    );
  }
  if (f.kind === "textarea") return <textarea name={f.key} defaultValue={value} rows={2} className="input" aria-label={f.label} placeholder={f.placeholder} />;
  return (
    <input name={f.key} defaultValue={value} required={f.required} aria-label={f.label} placeholder={f.placeholder ?? f.label}
      type={f.kind === "number" ? "number" : f.kind} step={f.kind === "number" ? "any" : undefined} className={base} />
  );
}

/** Plain table with an empty state ("No Records Found!"). */
export function MiniTable({ head, rows, empty = "No Records Found!" }: { head: string[]; rows: React.ReactNode[][]; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
          <tr>{head.map((h, i) => <th key={i} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.length === 0 ? (
            <tr><td colSpan={head.length} className="px-3 py-8 text-center text-muted">{empty}</td></tr>
          ) : rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-3 py-2 align-top">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
