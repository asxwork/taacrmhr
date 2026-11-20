"use client";
import { DrawerPortal } from "@/components/drawer-portal";

import Link from "@/components/link";
import { saveLeadNav } from "./lead-nav";
import { useFitHeight } from "@/components/use-fit-height";
import { EdgeScroll } from "@/components/edge-scroll";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import {
  AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronUp, Download, KanbanSquare,
  List, Loader2, MessageCircle, Pencil, Phone, Play, Plus, Settings, Trash2, Upload, X,
  ArrowDown, ArrowUp, ArrowUpDown,
} from "lucide-react";
import { ACTIVITY_TYPES, color, fmtPhone, fmtPKR } from "@/lib/crm-shared";
import { LEAD_COLUMNS, SORTABLE_LEAD_COLUMNS, parseLeadSort } from "@/lib/lead-columns";
import { ColumnSettings } from "@/components/crm/column-settings";
import { scoreLabel } from "@/lib/lead-score";
import { LEAD_FILTER_KEYS, type LeadFilters } from "@/lib/lead-filters-shared";
import type { LeadListData, LeadRow } from "@/lib/lead-list";
import { cn } from "@/lib/utils";
import { Avatar, LinkButton } from "@/components/ui";
import { Kanban } from "@/components/crm/kanban";
import { StageProgress } from "@/components/crm/bits";
import { LeadFilterBar, type FilterPreset } from "@/components/crm/lead-filter-bar";
import { bulkLeadAction, changeLeadStage, fetchLeadList, quickLeadActivity, saveLeadColumns } from "@/app/(app)/crm/leads/list-actions";

type Opt = { id: string; name: string };
export type LeadStage = { id: string; name: string; color: string; kind: string; systemKey: string | null };
export type AutomationOption = { id: string; name: string; steps: string[]; assign: string; userIds: string[]; deletes: boolean };
type View = "list" | "board";
type Toast = { tone: "ok" | "error"; text: string } | null;
type Menu = { kind: "stage" | "activity"; row: LeadRow; top: number; left: number } | null;
type Dialog = { kind: "task" } | { kind: "automation"; id: string } | null;

const PAGE_SIZE = 50;
const PAGE_SIZES = [10, 20, 50, 100, 200, 500] as const;
// A download, not a page: plain <a>, built so the "use Link" lint rule leaves it alone.
const FULL_BACKUP_HREF = ["/api/export/leads-full", "everything=1"].join("?");
const ON_HOLD_HINT = "On-hold is set automatically when a new lead isn't worked in time.";

function queryOf(f: LeadFilters) {
  const p = new URLSearchParams();
  for (const k of LEAD_FILTER_KEYS) if (f[k]) p.set(k, f[k]!);
  return p;
}

/**
 * The lead list and board, working in place: filters, presets, paging, view switch, stage changes and bulk
 * actions fetch only the rows they need (list-actions.ts) and keep the address bar in sync, without a page load.
 */
export function LeadsWorkspace({ initial, initialFilters, initialView, initialColumns, presets, filterOptions, stages, assignees, automations, perms }: {
  initial: LeadListData;
  initialFilters: LeadFilters;
  initialView: View;
  initialColumns: string[];
  presets: FilterPreset[];
  filterOptions: { stages: Opt[]; sources: Opt[]; projects: Opt[]; owners: Opt[]; branches: Opt[]; canShare: boolean };
  stages: LeadStage[];
  assignees: Opt[];
  automations: AutomationOption[];
  perms: { canCreate: boolean; canEdit: boolean; canDelete: boolean; canExport: boolean; canAssign: boolean; canAddActivity: boolean; canBulk: boolean; canImport: boolean; isSuperAdmin: boolean; canMerge?: boolean; canConfigure?: boolean; canRoles?: boolean };
}) {
  const [filters, setFilters] = useState<LeadFilters>(initialFilters);
  const [view, setView] = useState<View>(initialView);
  const [data, setData] = useState<LeadListData>(initial);
  const [loading, startLoading] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [forAll, setForAll] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [autoId, setAutoId] = useState(automations[0]?.id ?? "");
  const request = useRef(0);
  // Columns (gear button / drag headers): saved per person.
  const [cols, setCols] = useState<string[]>(initialColumns);
  const [colsOpen, setColsOpen] = useState(false);
  const [dragCol, setDragCol] = useState<number | null>(null);
  const colLabel = (k: string) => LEAD_COLUMNS.find((c) => c.key === k)?.label ?? k;
  const applyCols = async (next: string[], scope: "me" | "everyone" | "reset") => {
    if (scope !== "reset") setCols(next);
    const res = await saveLeadColumns(next, scope);
    if (res.cols) setCols(res.cols);
    if (res.error) setToast({ tone: "error", text: res.error });
  };

  const openStages = stages.filter((s) => s.kind === "open");
  const pickable = stages.filter((s) => s.kind !== "converted");
  const stageOf = (id: string) => stages.find((s) => s.id === id);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === "error" ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /** Fetches rows for the given state and mirrors it in the address bar (refresh/back/share keep working). */
  // Rows per page ("Records"): kept with the data, remembered on this device.
  const sizeRef = useRef(initial.size);
  // List table and board fill the window under the toolbar (use-fit-height.ts); recomputed when rows or view change.
  const tableBox = useRef<HTMLDivElement>(null);
  useFitHeight(tableBox, 84, [view, initial]);
  const load = useCallback((f: LeadFilters, v: View, page: number, size: number = sizeRef.current) => {
    sizeRef.current = size;
    const p = queryOf(f);
    if (v === "board") p.set("view", "board");
    if (page > 1) p.set("page", String(page));
    if (size !== 50) p.set("size", String(size));
    window.history.replaceState(null, "", `/crm/leads${p.size ? `?${p}` : ""}`);
    const id = ++request.current;
    startLoading(async () => {
      const next = await fetchLeadList(queryOf(f).toString(), v, page, size);
      if (id === request.current) setData(next);
    });
  }, []);
  // Back button: the browser can show a saved copy of this page from before the filters were set. If the address
  // (which keeps the filters) differs from what was drawn, load what the address says.
  useEffect(() => {
    const url = new URLSearchParams(window.location.search);
    const fromUrl = Object.fromEntries(LEAD_FILTER_KEYS.filter((k) => url.get(k)).map((k) => [k, url.get(k)!])) as LeadFilters;
    const v: View = url.get("view") === "board" ? "board" : "list";
    const page = Math.max(1, Number(url.get("page")) || 1);
    const size = Number(url.get("size")) || initial.size;
    if (queryOf(fromUrl).toString() === queryOf(initialFilters).toString() && v === initialView && page === initial.page && size === initial.size) return;
    setFilters(fromUrl); setView(v);
    load(fromUrl, v, page, size);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setPageSize = (size: number) => {
    try { localStorage.setItem("leads:size", String(size)); } catch { /* private mode */ }
    setSelected(new Set());
    load(filters, view, 1, size);
  };
  // Opened without ?size=: use the number this person picked last time.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("size")) return;
    let saved = 0;
    try { saved = Number(localStorage.getItem("leads:size")); } catch { /* private mode */ }
    if (PAGE_SIZES.includes(saved as (typeof PAGE_SIZES)[number]) && saved !== initial.size) load(initialFilters, initialView, 1, saved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = (input: LeadFilters) => {
    // Sorting isn't a filter: changing filters or presets keeps the chosen column order.
    const f = { ...input, sort: "sort" in input ? input.sort : filters.sort };
    if (!f.sort) delete f.sort;
    setFilters(f);
    setSelected(new Set());
    setForAll(false);
    load(f, view, 1);
  };
  const refresh = () => load(filters, view, data.page);
  const sort = parseLeadSort(filters.sort);
  const sortWords = (k: string) => (["created", "modified", "lastActivity", "reshuffle"].includes(k) ? ["newest", "oldest"] : ["id", "budget"].includes(k) ? ["highest", "lowest"] : ["Z–A", "A–Z"]);
  const canSort = (k: string) => (SORTABLE_LEAD_COLUMNS as readonly string[]).includes(k);
  /** Header click: first click newest / highest first for dates and numbers, A–Z for text; next click flips it. */
  const sortBy = (k: string) => {
    const firstDesc = ["id", "created", "modified", "lastActivity", "reshuffle", "budget"].includes(k);
    const desc = sort.key === k ? !sort.desc : firstDesc;
    const v = k === "created" && desc ? undefined : `${desc ? "-" : ""}${k}`;
    applyFilters({ ...filters, sort: v });
  };
  const patchRow = (id: string, patch: Partial<LeadRow>) => setData((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  async function moveStage(row: LeadRow, statusId: string) {
    setMenu(null);
    if (row.statusId === statusId) return;
    const before = row.statusId;
    patchRow(row.id, { statusId }); // instant; undone if the server refuses
    const res = await changeLeadStage(row.id, statusId);
    if (res.error) {
      patchRow(row.id, { statusId: before });
      setToast({ tone: "error", text: res.error });
    } else setToast({ tone: "ok", text: `${row.name} → ${stageOf(statusId)?.name}` });
  }

  /** Runs a bottom-bar action on the selection (or every lead in the filter with "For all"). */
  async function bulk(op: string, extra: Record<string, string | string[]> = {}) {
    const fd = new FormData();
    fd.set("op", op);
    if (forAll) {
      fd.set("forAll", "on");
      fd.set("query", queryOf(filters).toString());
    } else selected.forEach((id) => fd.append("ids", id));
    for (const [k, v] of Object.entries(extra)) (Array.isArray(v) ? v : [v]).forEach((x) => fd.append(k, x));
    const res = await bulkLeadAction(fd);
    if (res?.error) return setToast({ tone: "error", text: res.error });
    setToast({ tone: "ok", text: res?.message ?? "Done." });
    setSelected(new Set());
    setForAll(false);
    setDialog(null);
    refresh();
  }

  const count = forAll ? data.total : selected.size;
  const pageIds = data.rows.filter((r) => r.editable).map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const auto = automations.find((a) => a.id === autoId);

  const counter = (label: string, n: number, activity: string, tone: string) => (
    <button
      type="button"
      onClick={() => applyFilters({ ...filters, activity: filters.activity === activity ? undefined : activity })}
      className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors", filters.activity === activity ? "bg-navy-900/[0.07] font-medium text-navy-900" : "text-muted hover:bg-canvas hover:text-ink")}
    >
      <span className={cn("min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums", n ? tone : "bg-black/5 text-muted")}>{n > 99 ? "99+" : n}</span>
      {label}
    </button>
  );
  const viewTab = (v: View, Icon: typeof List, label: string) => (
    <button type="button" onClick={() => { setView(v); load(filters, v, 1); }} className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm", view === v ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
      <Icon className="size-4" /><span className="hidden sm:inline">{label}</span>
    </button>
  );
  const exportHref = (path: string, extra?: Record<string, string>) => {
    const p = queryOf(filters);
    for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
    return `${path}${p.size ? `?${p}` : ""}`;
  };
  // Remember this list for "previous / next lead" on the lead page (components/crm/lead-nav.tsx).
  useEffect(() => {
    if (view !== "list") return;
    const size = data.size || PAGE_SIZE;
    saveLeadNav({ ids: data.rows.map((r) => r.id), page: data.page, pages: Math.max(1, Math.ceil(data.total / size)), total: data.total, size, query: queryOf(filters).toString() });
  }, [data, view, filters]);
  const pageSize = data.size || PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(data.total / pageSize));
  // Page numbers around the current one: 1 … 4 5 [6] 7 8 … 40
  const pageList = (() => {
    const out: (number | "…")[] = [];
    for (let n = 1; n <= pages; n++) {
      if (n === 1 || n === pages || Math.abs(n - data.page) <= 2) out.push(n);
      else if (out[out.length - 1] !== "…") out.push("…");
    }
    return out;
  })();
  const openMenu = (kind: "stage" | "activity", row: LeadRow, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu({ kind, row, top: Math.min(r.bottom + 4, window.innerHeight - 340), left: Math.min(r.left, window.innerWidth - 300) });
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">Leads</h1>
        {perms.canCreate && (
          <div className="flex">
            <LinkButton href="/crm/leads/new" className={perms.canImport ? "rounded-r-none" : undefined} prefetch><Plus className="size-4" /> Create</LinkButton>
            {perms.canImport && <LinkButton href={exportHref("/crm/leads", { import: "1" })} scroll={false} className="rounded-l-none border-l border-white/15 px-2.5" title="Import" aria-label="Import"><Upload className="size-4" /></LinkButton>}
          </div>
        )}
        <div className="order-last w-full sm:order-none sm:w-auto sm:min-w-80 sm:flex-1">
          <LeadFilterBar filters={filters} view={view === "board" ? "board" : undefined} presets={presets} options={filterOptions} onApply={applyFilters} busy={loading} />
        </div>
        {perms.canExport && (
          <details className="group relative ml-auto sm:ml-0">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm shadow-xs hover:bg-canvas [&::-webkit-details-marker]:hidden" title="Export">
              <Download className="size-4" /> <span className="hidden sm:inline">Export</span>
            </summary>
            <div className="anim-fade absolute right-0 top-12 z-30 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
              <a href={exportHref("/api/export/leads-full")} className="block rounded-lg px-3 py-2 hover:bg-canvas">
                <span className="block text-sm font-medium">Excel with activities</span>
                <span className="block text-xs text-muted">Every field and every call, note and task for the leads in this filter. Imports back.</span>
              </a>
              <a href={FULL_BACKUP_HREF} className="block rounded-lg px-3 py-2 hover:bg-canvas">
                <span className="block text-sm font-medium">Everything (full backup)</span>
                <span className="block text-xs text-muted">All leads you can see, any stage, with activities.</span>
              </a>
              <a href={exportHref("/api/export/leads")} className="block rounded-lg px-3 py-2 hover:bg-canvas">
                <span className="block text-sm font-medium">CSV (leads only)</span>
                <span className="block text-xs text-muted">Simple spreadsheet of this list.</span>
              </a>
            </div>
          </details>
        )}
        {(perms.canImport || perms.canExport || perms.canMerge || perms.canConfigure || perms.canRoles) && (
          // CRM settings (like Bitrix's gear): import, export, duplicates and setup, each only for people who may use it.
          <details className="group relative">
            <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-lg border border-line bg-surface shadow-xs hover:bg-canvas [&::-webkit-details-marker]:hidden" title="CRM settings" aria-label="CRM settings">
              <Settings className="size-4" />
            </summary>
            <nav className="anim-fade absolute right-0 top-12 z-30 w-64 divide-y divide-line rounded-xl border border-line bg-surface py-1 text-sm shadow-xl" aria-label="CRM settings">
              {(perms.canImport || perms.isSuperAdmin) && (
                <div className="py-1">
                  {perms.canImport && <Link href={exportHref("/crm/leads", { import: "1" })} scroll={false} className="block px-4 py-2 hover:bg-canvas">Import leads</Link>}
                  {perms.isSuperAdmin && <Link href="/settings/bitrix-import" className="block px-4 py-2 hover:bg-canvas">Migrate from Bitrix</Link>}
                </div>
              )}
              {perms.canExport && (
                <div className="py-1">
                  <a href={exportHref("/api/export/leads-full")} className="block px-4 py-2 hover:bg-canvas">Export leads to Excel</a>
                  <a href={exportHref("/api/export/leads")} className="block px-4 py-2 hover:bg-canvas">Export leads to CSV</a>
                </div>
              )}
              {perms.canMerge && (
                <div className="py-1">
                  <Link href="/crm/duplicates" className="block px-4 py-2 hover:bg-canvas">Find and merge duplicates</Link>
                </div>
              )}
              {(perms.canConfigure || perms.canRoles) && (
                <div className="py-1">
                  {perms.canConfigure && <Link href="/settings/crm#lead-statuses" className="block px-4 py-2 hover:bg-canvas">Configure stages</Link>}
                  {perms.canConfigure && <Link href="/settings/crm#lead-sources" className="block px-4 py-2 hover:bg-canvas">Lead sources</Link>}
                  {perms.canConfigure && <Link href="/settings/crm#deal-inventory-types" className="block px-4 py-2 hover:bg-canvas">Deal &amp; inventory types</Link>}
                  {perms.canRoles && <Link href="/settings/roles" className="block px-4 py-2 hover:bg-canvas">Access permissions</Link>}
                </div>
              )}
            </nav>
          </details>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex max-w-full overflow-x-auto rounded-lg bg-black/5 p-0.5">
          {viewTab("board", KanbanSquare, "Kanban")}
          {viewTab("list", List, "List")}
        </div>
        <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5">
          {counter("Overdue", data.counters.overdue, "overdue", "bg-red-500 text-white")}
          {counter("Today", data.counters.today, "today", "bg-gold-600 text-white")}
          {counter("Nothing planned", data.counters.none, "none", "bg-navy-900 text-white")}
        </div>
        {loading && <Loader2 className="size-4 animate-spin text-muted" aria-label="Loading" />}

        {/* Top right: automation rules + quick run on the selection */}
        {/* Automations act on many leads at once: only for people with Bulk actions (rules live in Settings). */}
        {perms.canEdit && perms.canBulk && automations.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            {auto && (
              <div className="relative flex">
                <button
                  type="button"
                  onClick={() => (count ? setDialog({ kind: "automation", id: auto.id }) : setToast({ tone: "error", text: "Tick the leads first, then run the automation." }))}
                  className="flex h-9 max-w-64 items-center gap-1.5 rounded-l-lg border border-line bg-surface px-3 text-sm shadow-xs hover:bg-canvas"
                  title={`Run “${auto.name}” on the selected leads`}
                >
                  <Play className="size-3.5 shrink-0 text-gold-600" /><span className="truncate">{auto.name}</span>
                </button>
                <details className="relative">
                  <summary className="flex h-9 cursor-pointer list-none items-center rounded-r-lg border border-l-0 border-line bg-surface px-2 shadow-xs hover:bg-canvas [&::-webkit-details-marker]:hidden" aria-label="Choose automation"><ChevronDown className="size-4" /></summary>
                  <div className="anim-fade absolute right-0 top-11 z-30 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
                    {automations.map((a) => (
                      <button key={a.id} type="button" onClick={(e) => { setAutoId(a.id); e.currentTarget.closest("details")?.removeAttribute("open"); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-canvas">
                        <Check className={cn("size-4 shrink-0", a.id === autoId ? "text-navy-900" : "invisible")} />{a.name}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={cn("transition-opacity", loading && "opacity-60")}>
        {view === "board" ? (
          <Kanban
            columns={stages
              .filter((s) => (filters.group === "all" || filters.stage ? true : filters.group ? s.kind === filters.group : s.kind === "open"))
              .map((s) => ({ id: s.id, name: s.name, dot: color(s.color).dot, ...(s.systemKey === "onhold" && { locked: true, lockedHint: ON_HOLD_HINT }) }))}
            cards={data.rows.map((l) => ({
              id: l.id,
              columnId: l.statusId,
              title: l.name,
              href: `/crm/leads/${l.id}`,
              subtitle: l.subtitle || (l.phone?.includes("•") ? l.phone : fmtPhone(l.phone)) || undefined,
              meta: [l.number && `#${l.number}`, l.source].filter(Boolean).join(" · "),
              amount: l.budget ?? undefined,
              owner: l.owner ?? undefined,
              draggable: perms.canEdit && l.editable,
            }))}
            onMove={async (id, statusId) => {
              const res = await changeLeadStage(id, statusId);
              if (!res.error) patchRow(id, { statusId });
              return res;
            }}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
            {data.rows.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="font-medium">No leads here</p>
                <p className="mt-1 text-sm text-muted">{Object.keys(filters).some((k) => k !== "sort") ? "Nothing matches this filter. Try another preset or reset the filter." : "Create your first lead or import a file."}</p>
              </div>
            ) : (<>
              {/* Phones: one card per lead with big Call / WhatsApp buttons instead of a wide table. */}
              <div className="flex items-center gap-2 border-b border-line px-4 py-2 sm:hidden">
                <span className="text-xs text-muted">Sort</span>
                <select value={`${sort.desc ? "-" : ""}${sort.key}`} onChange={(e) => applyFilters({ ...filters, sort: e.target.value === "-created" ? undefined : e.target.value })} className="input h-8 flex-1 text-sm" aria-label="Sort leads">
                  {cols.filter(canSort).flatMap((k) => { const [d, a] = sortWords(k); return [<option key={`-${k}`} value={`-${k}`}>{colLabel(k)} · {d}</option>, <option key={k} value={k}>{colLabel(k)} · {a}</option>]; })}
                  {!cols.includes("created") && <><option value="-created">Created · newest</option><option value="created">Created · oldest</option></>}
                </select>
              </div>
              <ul className="divide-y divide-line sm:hidden">
                {data.rows.map((l) => {
                  const st = stageOf(l.statusId);
                  const canChange = perms.canEdit && l.editable;
                  return (
                    <li key={l.id} className={cn("flex gap-3 px-4 py-3", (forAll || selected.has(l.id)) && "bg-navy-900/[0.03]")}>
                      {perms.canEdit && perms.canBulk && l.editable && (
                        <input type="checkbox" checked={forAll || selected.has(l.id)} disabled={forAll} onChange={() => toggle(l.id)} className="mt-1.5 size-4 shrink-0 accent-navy-900" aria-label={`Select ${l.name}`} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <Link href={`/crm/leads/${l.id}`} className="min-w-0 flex-1 truncate font-medium text-navy-900">{l.name}</Link>
                          {l.score >= 35 && <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold", l.score >= 60 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>{scoreLabel(l.score)}</span>}
                          <span className="shrink-0 text-xs tabular-nums text-muted">#{l.number ?? "—"}</span>
                        </div>
                        <p className="truncate text-xs text-muted">{[l.source, l.project, l.created].filter(Boolean).join(" · ")}</p>
                        <div className="mt-2">
                          {canChange ? (
                            <button type="button" onClick={(e) => openMenu("stage", l, e.currentTarget)} className="-m-1 w-full rounded-md p-1 text-left hover:bg-canvas" title="Change stage">
                              <StageProgress steps={openStages} currentId={l.statusId} name={`${st?.name ?? "—"} ▾`} colorName={st?.color ?? "slate"} kind={st?.kind} />
                            </button>
                          ) : <StageProgress steps={openStages} currentId={l.statusId} name={st?.name ?? "—"} colorName={st?.color ?? "slate"} kind={st?.kind} />}
                        </div>
                        {l.next && <p className="mt-1.5 truncate text-xs"><span className={cn("font-medium", l.next.late ? "text-red-600" : "text-ink/80")}>{l.next.due}</span> · {l.next.subject}</p>}
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          {l.phone && l.phoneTel && <a href={l.phoneTel} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-navy-900 active:bg-canvas"><Phone className="size-4" /> Call</a>}
                          {l.phone && l.phoneWa && <a href={l.phoneWa} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#25D366]/40 px-3 text-sm font-medium text-[#128C7E] active:bg-[#25D366]/10" aria-label={`WhatsApp ${l.name}`}><MessageCircle className="size-4" /> WhatsApp</a>}
                          {perms.canAddActivity && <button type="button" onClick={(e) => openMenu("activity", l, e.currentTarget)} className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-sm text-muted active:bg-canvas">+ Activity</button>}
                          {l.owner && <span className="ml-auto" title={l.owner}><Avatar name={l.owner} className="size-7 text-[10px]" /></span>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {/* The table scrolls inside this box (headers stay at the top, the page bar stays in view): no page scrolling. */}
              <div className="relative hidden sm:block">
              <EdgeScroll target={tableBox} />
              <div ref={tableBox} className="thin-scroll overflow-auto overscroll-contain">
                <table className="w-full [&_td]:px-3 [&_th]:px-3 2xl:[&_td]:px-4 2xl:[&_th]:px-4">
                  <thead className="sticky top-0 z-10 border-b border-line bg-[color-mix(in_srgb,var(--color-canvas)_60%,var(--color-surface))] shadow-[0_1px_0_var(--color-line)]">
                    <tr>
                      <th className="th w-16">
                        <span className="flex items-center gap-2">
                          {perms.canEdit && perms.canBulk && (
                            <input type="checkbox" aria-label="Select all on this page" className="accent-navy-900" checked={allOnPage}
                              onChange={(e) => { setForAll(false); setSelected(e.target.checked ? new Set(pageIds) : new Set()); }} />
                          )}
                          <button type="button" onClick={() => setColsOpen(true)} className="rounded p-0.5 text-muted hover:bg-black/5 hover:text-ink" title="Choose and order columns" aria-label="Column settings"><Settings className="size-4" /></button>
                        </span>
                      </th>
                      {cols.map((k, i) => (
                        <th key={k} draggable onDragStart={() => setDragCol(i)} onDragOver={(e) => { e.preventDefault(); }} onDrop={() => { if (dragCol !== null && dragCol !== i) { const a = [...cols]; const [x] = a.splice(dragCol, 1); a.splice(i, 0, x!); void applyCols(a, "me"); } setDragCol(null); }}
                          className={cn("th cursor-grab select-none whitespace-nowrap", k === "id" && "w-12", dragCol === i && "opacity-50")} title="Drag to move this column">
                          {canSort(k) ? (
                            <button type="button" onClick={() => sortBy(k)} className={cn("group inline-flex items-center gap-1 uppercase hover:text-ink", sort.key === k && "text-ink")}
                              title={`Sort by ${colLabel(k)}`} aria-label={`Sort by ${colLabel(k)}${sort.key === k ? `, ${sortWords(k)[sort.desc ? 0 : 1]} first` : ""}`}>
                              {colLabel(k)}
                              {sort.key === k ? (sort.desc ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />) : <ArrowUpDown className="size-3.5 opacity-0 transition group-hover:opacity-60" />}
                            </button>
                          ) : colLabel(k)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.rows.map((l) => {
                      const st = stageOf(l.statusId);
                      const canChange = perms.canEdit && l.editable;
                      const cell = (k: string) => {
                        switch (k) {
                          case "id": return <td key={k} className="td text-xs tabular-nums text-muted">{l.number ?? "—"}{l.reshuffleCount != null && !cols.includes("reshuffle") && <span title={`Reshuffled ${l.reshuffleCount}×`} className="mt-1 block w-fit rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-700">Reshuffled</span>}</td>;
                          case "lead": return (
                            <td key={k} className="td max-w-64">
                              <Link href={`/crm/leads/${l.id}`} className="font-medium text-navy-900 hover:underline">{l.name}</Link>
                              {l.score >= 35 && <span title={`Lead score ${l.score}/100\n${l.scoreWhy.join("\n")}`} className={cn("ml-1.5 rounded-full px-1.5 py-px align-middle text-[10px] font-semibold", l.score >= 60 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>{scoreLabel(l.score)}</span>}
                              <p className="truncate text-xs text-muted">{[l.source, l.project].filter(Boolean).join(" · ") || "—"}</p>
                            </td>
                          );
                          case "stage": return (
                            <td key={k} className="td">
                              {canChange ? (
                                <button type="button" onClick={(e) => openMenu("stage", l, e.currentTarget)} className="-m-1 rounded-md p-1 text-left hover:bg-canvas" title="Change stage">
                                  <StageProgress steps={openStages} currentId={l.statusId} name={`${st?.name ?? "—"} ▾`} colorName={st?.color ?? "slate"} kind={st?.kind} />
                                </button>
                              ) : <StageProgress steps={openStages} currentId={l.statusId} name={st?.name ?? "—"} colorName={st?.color ?? "slate"} kind={st?.kind} />}
                            </td>
                          );
                          case "phone": return (
                            <td key={k} className="td whitespace-nowrap text-sm">
                              {l.phone ? (
                                <span className="inline-flex items-center gap-2">
                                  <a href={l.phoneTel ?? "#"} className="inline-flex items-center gap-1.5 hover:text-navy-900 hover:underline"><Phone className="size-3.5 text-muted" />{l.phone.includes("•") ? l.phone : fmtPhone(l.phone)}</a>
                                  <a href={l.phoneWa ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded p-0.5 text-[#25D366] hover:bg-[#25D366]/10" title="Message on WhatsApp" aria-label={`WhatsApp ${l.name}`}><MessageCircle className="size-4" /></a>
                                </span>
                              ) : <span className="text-muted">—</span>}
                            </td>
                          );
                          case "activity": return (
                            <td key={k} className="td min-w-32 max-w-60">
                              {l.next ? (
                                <>
                                  <p className={cn("text-xs font-medium", l.next.late ? "text-red-600" : "text-ink/80")}>{l.next.due}</p>
                                  <p className="truncate text-sm">{l.next.subject}</p>
                                  {l.next.owner && <p className="text-xs text-muted">for <span className="text-navy-900">{l.next.owner}</span></p>}
                                </>
                              ) : null}
                              {perms.canAddActivity && <button type="button" onClick={(e) => openMenu("activity", l, e.currentTarget)} className="mt-0.5 text-xs text-muted hover:text-navy-900 hover:underline">+ Add activity</button>}
                            </td>
                          );
                          case "owner": return <td key={k} className="td whitespace-nowrap">{l.owner ? <span className="flex items-center gap-2 text-sm" title={l.owner}><Avatar name={l.owner} className="size-7 text-[10px]" /><span className="hidden 2xl:inline">{l.owner}</span></span> : <span className="text-muted">—</span>}</td>;
                          case "reshuffle": return <td key={k} className="td whitespace-nowrap text-sm">{l.reshuffleCount != null ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">Yes · {l.reshuffleCount}×</span> : <span className="text-muted">No</span>}</td>;
                          case "score": return <td key={k} className="td whitespace-nowrap text-sm tabular-nums" title={l.scoreWhy.join("\n")}>{l.score}<span className="text-muted">/100</span></td>;
                          case "budget": return <td key={k} className="td whitespace-nowrap text-sm tabular-nums">{l.budget ? fmtPKR(l.budget) : <span className="text-muted">—</span>}</td>;
                          case "sourceInfo": return <td key={k} className="td max-w-64 text-xs text-muted"><span className="line-clamp-3 whitespace-pre-line">{l.sourceInfo ?? "—"}</span></td>;
                          default: {
                            const v = (l as unknown as Record<string, string | null>)[k];
                            return <td key={k} className="td max-w-56 truncate whitespace-nowrap text-sm text-muted">{v || "—"}</td>;
                          }
                        }
                      };
                      return (
                        <tr key={l.id} className={cn("align-top transition-colors hover:bg-canvas/60", (forAll || selected.has(l.id)) && "bg-navy-900/[0.03]")}>
                          <td className="td">{perms.canEdit && perms.canBulk && l.editable && <input type="checkbox" checked={forAll || selected.has(l.id)} disabled={forAll} onChange={() => toggle(l.id)} className="accent-navy-900" aria-label={`Select ${l.name}`} />}</td>
                          {cols.map(cell)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
            </>)}
            {/* Bottom bar: where you are in the list, the pages, and how many rows a page shows. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-canvas/40 px-4 py-2.5 text-sm">
              <p className="min-w-0 text-muted" title="Leads matching the current filters">
                {data.total ? <><b className="tabular-nums text-ink">{((data.page - 1) * pageSize + 1).toLocaleString()}–{Math.min(data.page * pageSize, data.total).toLocaleString()}</b> of <b className="tabular-nums text-ink">{data.total.toLocaleString()}</b> leads</> : "No leads"}
                {count > 0 && <span className="ml-2 rounded-full bg-navy-900/[0.07] px-2 py-0.5 text-xs font-medium text-ink">{count.toLocaleString()} selected</span>}
              </p>
              {pages > 1 && (
                <nav aria-label="Pages" className="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5 sm:mx-auto">
                  {([["First page", 1, ChevronsLeft], ["Previous page", data.page - 1, ChevronLeft]] as const).map(([label, to, Icon]) => (
                    <button key={label} type="button" disabled={data.page <= 1} onClick={() => load(filters, view, to)} aria-label={label} title={label} className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink disabled:opacity-30"><Icon className="size-4" /></button>
                  ))}
                  {pageList.map((n, i) => n === "…" ? <span key={`g${i}`} className="px-1 text-muted">…</span> : (
                    <button key={n} type="button" onClick={() => n !== data.page && load(filters, view, n)} aria-current={n === data.page ? "page" : undefined}
                      className={cn("h-8 min-w-8 rounded-md px-2 text-sm tabular-nums", n === data.page ? "bg-navy-900 font-semibold text-white" : "text-ink/80 hover:bg-canvas")}>{n}</button>
                  ))}
                  {([["Next page", data.page + 1, ChevronRight], ["Last page", pages, ChevronsRight]] as const).map(([label, to, Icon]) => (
                    <button key={label} type="button" disabled={data.page >= pages} onClick={() => load(filters, view, to)} aria-label={label} title={label} className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink disabled:opacity-30"><Icon className="size-4" /></button>
                  ))}
                </nav>
              )}
              <label className="ml-auto flex items-center gap-2 text-muted sm:ml-0">Show
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Leads per page" className="input h-8 w-[4.5rem] py-0 text-sm">
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                per page
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Row popovers: stage picker and quick activity */}
      {menu && (
        <Popover top={menu.top} left={menu.left} onClose={() => setMenu(null)}>
          {menu.kind === "stage" ? (
            <div className="w-60 p-1.5">
              <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-muted">Move “{menu.row.name}” to</p>
              {pickable.map((s) => {
                const locked = s.systemKey === "onhold";
                return (
                  <button key={s.id} type="button" disabled={locked} onClick={() => moveStage(menu.row, s.id)} title={locked ? ON_HOLD_HINT : undefined}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-45">
                    <span className={cn("size-2.5 shrink-0 rounded-full", color(s.color).dot)} />
                    <span className="flex-1 truncate">{s.name}</span>
                    {s.id === menu.row.statusId && <Check className="size-4 text-navy-900" />}
                    {locked && <span className="text-[10px] text-muted">auto</span>}
                  </button>
                );
              })}
              <Link href={`/crm/leads/${menu.row.id}?convert=1`} className="mt-1 block rounded-lg border-t border-line px-2.5 pb-1.5 pt-2 text-sm text-emerald-700 hover:bg-emerald-50">Complete lead (create deal)…</Link>
            </div>
          ) : (
            <QuickActivity
              row={menu.row}
              onDone={(next) => { patchRow(menu.row.id, { next }); setMenu(null); setToast({ tone: "ok", text: `Activity added to ${menu.row.name}` }); }}
              onError={(text) => setToast({ tone: "error", text })}
            />
          )}
        </Popover>
      )}

      {/* Bottom selection bar (Bitrix-style) */}
      {perms.canEdit && perms.canBulk && count > 0 && (
        <SelectionBar
          count={count}
          total={data.total}
          forAll={forAll}
          onForAll={setForAll}
          onClear={() => { setSelected(new Set()); setForAll(false); }}
          editHref={!forAll && selected.size === 1 ? `/crm/leads/${[...selected][0]}?edit=1` : null}
          mergeHref={perms.canMerge && !forAll && selected.size >= 2 && selected.size <= 10 ? `/crm/duplicates/review?ids=${[...selected].join(",")}` : null}
          canDelete={perms.canDelete}
          canAssign={perms.canAssign}
          stages={pickable.filter((s) => s.systemKey !== "onhold")}
          assignees={assignees}
          automations={automations}
          onBulk={bulk}
          onDialog={setDialog}
        />
      )}

      {dialog?.kind === "task" && (
        <Modal title={`Add task to ${count} lead${count === 1 ? "" : "s"}`} onClose={() => setDialog(null)}>
          <TaskForm onSubmit={(subject, dueAt) => bulk("task", { subject, dueAt })} />
        </Modal>
      )}
      {dialog?.kind === "automation" && (() => {
        const a = automations.find((x) => x.id === dialog.id);
        return a ? (
          <Modal title={`Run “${a.name}” on ${count} lead${count === 1 ? "" : "s"}`} onClose={() => setDialog(null)}>
            <AutomationForm automation={a} assignees={assignees} isSuperAdmin={perms.isSuperAdmin} onRun={(agentIds) => bulk("automation", { automationId: a.id, agentIds, confirmRun: "on" })} />
          </Modal>
        ) : null;
      })()}

      {colsOpen && <ColumnSettings value={cols} isSuperAdmin={perms.isSuperAdmin} onApply={applyCols} onClose={() => setColsOpen(false)} />}
      {toast && (
        <div role="status" className={cn("anim-fade fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm shadow-xl", toast.tone === "error" ? "bg-red-600 text-white" : "bg-navy-900 text-white")}>
          {toast.text}
        </div>
      )}
    </>
  );
}

function Popover({ top, left, onClose, children }: { top: number; left: number; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const scroll = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); window.removeEventListener("scroll", scroll, true); };
  }, [onClose]);
  return (
    <div ref={ref} style={{ top, left }} className="anim-fade fixed z-50 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl">
      {children}
    </div>
  );
}

const inHour = () => format(new Date(Date.now() + 3_600_000), "yyyy-MM-dd'T'HH:00");

function QuickActivity({ row, onDone, onError }: { row: LeadRow; onDone: (next: LeadRow["next"]) => void; onError: (text: string) => void }) {
  const [type, setType] = useState("call");
  const [planned, setPlanned] = useState(true);
  const [busy, setBusy] = useState(false);
  const schedulable = ["task", "meeting", "visit"].includes(type) || (type === "call" && planned);
  return (
    <form
      className="w-72 space-y-2.5 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("leadId", row.id);
        // A planned call is saved as a task "Call …" so it shows as the next activity.
        if (type === "call" && planned) { fd.set("type", "task"); fd.set("subject", String(fd.get("subject") || `Call ${row.name}`)); }
        setBusy(true);
        const res = await quickLeadActivity(fd);
        setBusy(false);
        if (res.error) onError(res.error);
        else onDone(res.next ?? null);
      }}
    >
      <p className="text-xs font-medium text-muted">Add activity · {row.name}</p>
      <div className="flex flex-wrap gap-1">
        {ACTIVITY_TYPES.map((t) => (
          <button key={t.value} type="button" onClick={() => setType(t.value)} className={cn("rounded-md px-2 py-1 text-xs", type === t.value ? "bg-navy-900 text-white" : "bg-black/5 text-ink/80 hover:bg-black/10")}>{t.label}</button>
        ))}
      </div>
      <input type="hidden" name="type" value={type} />
      {type === "call" && (
        <div className="flex rounded-lg bg-black/5 p-0.5 text-xs">
          <button type="button" onClick={() => setPlanned(true)} className={cn("flex-1 rounded-md py-1", planned ? "bg-surface font-medium shadow-sm" : "text-muted")}>Plan a call</button>
          <button type="button" onClick={() => setPlanned(false)} className={cn("flex-1 rounded-md py-1", !planned ? "bg-surface font-medium shadow-sm" : "text-muted")}>Log a call made</button>
        </div>
      )}
      {type === "note" ? (
        <textarea name="body" required rows={3} placeholder="Note" className="input" autoFocus />
      ) : (
        <input name="subject" placeholder={type === "call" ? `Call ${row.name}` : "What needs doing?"} className="input" autoFocus />
      )}
      {type === "call" && !planned && <textarea name="body" rows={2} placeholder="What was said?" className="input" />}
      {schedulable && <input name="dueAt" type="datetime-local" required defaultValue={inHour()} className="input" aria-label="When" />}
      <button type="submit" disabled={busy} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-navy-900 text-sm font-medium text-white disabled:opacity-60">
        {busy && <Loader2 className="size-4 animate-spin" />} Save
      </button>
    </form>
  );
}

function SelectionBar({ count, total, forAll, onForAll, onClear, editHref, mergeHref, canDelete, canAssign, stages, assignees, automations, onBulk, onDialog }: {
  count: number; total: number; forAll: boolean; onForAll: (v: boolean) => void; onClear: () => void; editHref: string | null; mergeHref?: string | null;
  canDelete: boolean; canAssign: boolean; stages: LeadStage[]; assignees: Opt[]; automations: AutomationOption[];
  onBulk: (op: string, extra?: Record<string, string | string[]>) => Promise<void>; onDialog: (d: Dialog) => void;
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<"root" | "stage" | "assign" | "automation">("root");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open]);
  const run = async (op: string, extra?: Record<string, string | string[]>) => {
    setOpen(false);
    setBusy(true);
    await onBulk(op, extra);
    setBusy(false);
  };
  const item = (label: string, onClick: () => void, sub?: boolean) => (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-canvas">
      {label}{sub && <ChevronRight className="size-4 text-muted" />}
    </button>
  );

  return (
    <div className="anim-fade fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 border-t border-line bg-surface/95 lg:bottom-0 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] lg:left-[var(--sb-w,0px)] lg:transition-[left]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5 sm:px-8">
        {/* 2–10 ticked: merge exactly these on the side-by-side merge screen. */}
        {mergeHref && <Link href={mergeHref} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium hover:bg-canvas" title="Merge the ticked leads into one">Merge {count}</Link>}
        {canDelete && (
          <button type="button" disabled={busy} onClick={() => confirm(`Delete ${count} lead(s)? This can't be undone.`) && run("delete")} className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-red-600 hover:bg-red-50">
            <Trash2 className="size-4" /> Delete
          </button>
        )}
        {editHref && (
          <Link href={editHref} className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium hover:bg-canvas"><Pencil className="size-4" /> Edit</Link>
        )}
        <div ref={ref} className="relative">
          <button type="button" disabled={busy} onClick={() => { setOpen((o) => !o); setLevel("root"); }} className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium shadow-xs hover:bg-canvas">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Select action <ChevronUp className={cn("size-4 transition-transform", !open && "rotate-180")} />
          </button>
          {open && (
            <div className="anim-fade absolute bottom-11 left-0 max-h-80 w-72 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-2xl">
              {level !== "root" && (
                <button type="button" onClick={() => setLevel("root")} className="mb-1 flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-canvas"><ChevronLeft className="size-3.5" /> Back</button>
              )}
              {level === "root" && (
                <>
                  {item("Change stage", () => setLevel("stage"), true)}
                  {canAssign && item("Change responsible person", () => setLevel("assign"), true)}
                  {item("Add task", () => { setOpen(false); onDialog({ kind: "task" }); })}
                  {automations.length > 0 && item("Run automation", () => setLevel("automation"), true)}
                </>
              )}
              {level === "stage" && stages.map((s) => (
                <button key={s.id} type="button" onClick={() => run("status", { statusId: s.id })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-canvas">
                  <span className={cn("size-2.5 rounded-full", color(s.color).dot)} />{s.name}
                </button>
              ))}
              {level === "assign" && assignees.map((u) => (
                <button key={u.id} type="button" onClick={() => run("assign", { ownerId: u.id })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-canvas">
                  <Avatar name={u.name} className="size-6 text-[9px]" />{u.name}
                </button>
              ))}
              {level === "automation" && automations.map((a) => item(a.name, () => { setOpen(false); onDialog({ kind: "automation", id: a.id }); }))}
            </div>
          )}
        </div>
        <label className="flex h-9 items-center gap-2 px-2 text-sm" title={`Apply to all ${total} leads in this filter, not just the ticked ones`}>
          <input type="checkbox" checked={forAll} onChange={(e) => onForAll(e.target.checked)} className="accent-navy-900" /> For all
        </label>
        <span className="ml-auto text-xs font-medium uppercase tracking-wide text-muted">Selected: {count} / {total}</span>
        <button type="button" onClick={onClear} className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink" aria-label="Clear selection"><X className="size-4" /></button>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <DrawerPortal>
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/40 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="anim-fade w-full max-w-lg rounded-2xl bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-canvas" aria-label="Close"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
    </DrawerPortal>
  );
}

function TaskForm({ onSubmit }: { onSubmit: (subject: string, dueAt: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      setBusy(true);
      await onSubmit(String(fd.get("subject") || "Call the client"), new Date(String(fd.get("dueAt"))).toISOString());
      setBusy(false);
    }}>
      <input name="subject" placeholder="Call the client" className="input" autoFocus />
      <input name="dueAt" type="datetime-local" required defaultValue={inHour()} className="input" aria-label="Due" />
      <p className="text-xs text-muted">Each lead gets its own task, assigned to that lead&apos;s responsible person.</p>
      <button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white disabled:opacity-60">{busy && <Loader2 className="size-4 animate-spin" />} Add task</button>
    </form>
  );
}

function AutomationForm({ automation: a, assignees, isSuperAdmin, onRun }: { automation: AutomationOption; assignees: Opt[]; isSuperAdmin: boolean; onRun: (agentIds: string[]) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const blocked = a.deletes && !isSuperAdmin;
  return (
    <form className="space-y-3 text-sm" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      await onRun(new FormData(e.currentTarget).getAll("agentIds").map(String));
      setBusy(false);
    }}>
      <div>
        <p className="font-medium">For each lead it will:</p>
        <ul className="mt-1 list-disc pl-5 text-muted">{a.steps.map((s) => <li key={s}>{s}</li>)}</ul>
      </div>
      {a.assign !== "keep" && (
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-xs font-medium">{a.assign === "one" ? "Give them to" : "Share them between"}</legend>
          <div className="grid grid-cols-1 max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {assignees.map((u) => (
              <label key={u.id} className="flex items-center gap-2">
                <input type={a.assign === "one" ? "radio" : "checkbox"} name="agentIds" value={u.id} defaultChecked={a.userIds.includes(u.id)} className="accent-navy-900" /> {u.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {blocked ? (
        <p className="flex items-center gap-2 text-red-700"><AlertTriangle className="size-4" /> This automation deletes activities, so only a Super Admin can run it.</p>
      ) : (
        <>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="accent-navy-900" />
            {a.deletes ? "I understand the deleted activities can't be brought back" : "Run it on these leads"}
          </label>
          <button type="submit" disabled={!ok || busy} className={cn("inline-flex h-10 items-center gap-2 rounded-lg px-4 font-medium text-white disabled:opacity-40", a.deletes ? "bg-red-600" : "bg-navy-900")}>
            {busy && <Loader2 className="size-4 animate-spin" />} Run automation
          </button>
        </>
      )}
    </form>
  );
}
