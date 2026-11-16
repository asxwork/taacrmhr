"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BookmarkPlus, ChevronDown, Loader2, Mail, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Multi, type Opt } from "@/components/crm/lead-filter-bar";
import { saveAttPreset } from "@/app/(app)/hr/attendance/reports/actions";
import { PERIODS, filtersQuery, type AttFilters } from "@/lib/attendance-templates-shared";
import { cn } from "@/lib/utils";

/**
 * The filter panel every attendance template uses: a quick period, From / To, location, branch, department and
 * employees, then Generate. Save keeps it as a preset; turning on "Email it" sends it daily, weekly or monthly.
 */
export function AttReportFilters({ template, day, value, options }: {
  template: string; day?: boolean; value: AttFilters;
  options: { locations: string[]; branches: Opt[]; departments: Opt[]; employees: Opt[]; users: Opt[] };
}) {
  const router = useRouter();
  const [f, setF] = useState<AttFilters>(value);
  const [pending, start] = useTransition();
  const [saving, setSaving] = useState(false);
  const [save, setSave] = useState({ name: "", shared: false, schedule: "", recipients: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const count = [f.location, f.branchIds?.length, f.departmentIds?.length, f.employeeIds?.length].filter(Boolean).length;
  const set = (p: Partial<AttFilters>) => setF((cur) => ({ ...cur, ...p }));
  const go = (next = f) => start(() => router.push(`/hr/attendance/reports/${template}?${filtersQuery(next)}`, { scroll: false }));
  const ids = (v: string) => v.split(",").filter(Boolean);

  const submitSave = async () => {
    setSaving(true); setMsg(null);
    const r = await saveAttPreset({ template, name: save.name, filters: f, shared: save.shared, schedule: save.schedule, recipients: ids(save.recipients) });
    setSaving(false);
    if ("error" in r && r.error) setMsg(r.error); else { setMsg(save.schedule ? `Saved. It will be emailed ${save.schedule}.` : "Saved to your presets."); setSave({ name: "", shared: false, schedule: "", recipients: "" }); }
  };

  return (
    <div>
      {/* Phones: filters fold away so the report is on screen; always open from laptop size. */}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 text-sm font-medium lg:hidden">
        <SlidersHorizontal className="size-4 text-muted" /> Filters{count ? ` (${count})` : ""}
        <ChevronDown className={cn("ml-auto size-4 text-muted transition", open && "rotate-180")} />
      </button>
    <div className={cn("space-y-4 lg:block", open ? "mt-4 block" : "hidden")}>
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted">Period</p>
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.filter(([k]) => !day || ["today", "yesterday"].includes(k)).map(([k, l]) => (
            <button key={k} type="button" onClick={() => { const next = { ...f, period: f.period === k ? undefined : k }; setF(next); go(next); }}
              className={cn("rounded-full border px-2.5 py-1 text-xs", f.period === k ? "border-navy-900 bg-navy-900 text-white" : "border-line hover:bg-canvas")}>{l}</button>
          ))}
        </div>
      </div>
      <div className={cn("grid gap-2", day ? "grid-cols-1" : "grid-cols-2")}>
        {!day && <label className="text-xs font-medium text-muted">From<input type="date" value={f.from ?? ""} onChange={(e) => set({ from: e.target.value, period: undefined })} className="input mt-1 h-9" required /></label>}
        <label className="text-xs font-medium text-muted">{day ? "Date" : "To"}<input type="date" value={f.to ?? ""} onChange={(e) => set({ to: e.target.value, period: undefined, ...(day ? { from: e.target.value } : {}) })} className="input mt-1 h-9" required /></label>
      </div>
      {options.locations.length > 0 && (
        <label className="block text-xs font-medium text-muted">Location
          <select value={f.location ?? ""} onChange={(e) => set({ location: e.target.value || undefined })} className="input mt-1 h-9"><option value="">Any</option>{options.locations.map((l) => <option key={l}>{l}</option>)}</select>
        </label>
      )}
      {options.branches.length > 1 && <div><p className="mb-1 text-xs font-medium text-muted">Branch</p><Multi options={options.branches} value={f.branchIds?.join(",")} onChange={(v) => set({ branchIds: ids(v) })} /></div>}
      {options.departments.length > 0 && <div><p className="mb-1 text-xs font-medium text-muted">Department</p><Multi options={options.departments} value={f.departmentIds?.join(",")} onChange={(v) => set({ departmentIds: ids(v) })} /></div>}
      <div><p className="mb-1 text-xs font-medium text-muted">Employees</p><Multi options={options.employees} value={f.employeeIds?.join(",")} onChange={(v) => set({ employeeIds: ids(v) })} /></div>

      <div className="flex gap-2">
        <button type="button" onClick={() => go()} disabled={pending} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60">
          {pending && <Loader2 className="size-4 animate-spin" />} Generate
        </button>
        <button type="button" onClick={() => { const next: AttFilters = { period: day ? "today" : "month" }; setF(next); go(next); }} className="inline-flex h-10 items-center rounded-lg border border-line px-3 text-sm hover:bg-canvas" aria-label="Reset"><RotateCcw className="size-4" /></button>
      </div>

      <details className="rounded-lg border border-line" open={saving || !!msg}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium"><BookmarkPlus className="size-4 text-muted" /> Save preset / schedule email</summary>
        <div className="space-y-3 border-t border-line p-3">
          <input value={save.name} onChange={(e) => setSave({ ...save, name: e.target.value })} placeholder="Preset name, e.g. Sales team monthly" className="input h-9" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={save.shared} onChange={(e) => setSave({ ...save, shared: e.target.checked })} className="accent-navy-900" /> Share with HR team</label>
          <label className="block text-xs font-medium text-muted"><span className="flex items-center gap-1.5"><Mail className="size-3.5" /> Email it</span>
            <select value={save.schedule} onChange={(e) => setSave({ ...save, schedule: e.target.value })} className="input mt-1 h-9">
              <option value="">No, just save</option><option value="daily">Every morning (yesterday)</option><option value="weekly">Every Monday (last 7 days)</option><option value="monthly">On the 1st (last month)</option>
            </select>
          </label>
          {save.schedule && <div><p className="mb-1 text-xs font-medium text-muted">Send to (empty = me)</p><Multi options={options.users} value={save.recipients} onChange={(v) => setSave({ ...save, recipients: v })} /></div>}
          <button type="button" onClick={submitSave} disabled={saving} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-navy-900 text-sm font-medium text-navy-900 hover:bg-navy-900/5 disabled:opacity-60">{saving && <Loader2 className="size-4 animate-spin" />} Save</button>
          {msg && <p role="status" className="text-xs text-muted">{msg}</p>}
        </div>
      </details>
    </div>
    </div>
  );
}
