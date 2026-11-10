"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { setModuleForRole, setPermission } from "./actions";

type Opt = { value: string; label: string; short: string; about: string };
type Role = { id: string; name: string };

// One colour per access level, the same everywhere in the grid.
const PILL: Record<string, string> = {
  none: "bg-transparent text-muted/70 ring-line",
  own: "bg-amber-50 text-amber-800 ring-amber-200",
  team: "bg-orange-50 text-orange-800 ring-orange-200",
  branch: "bg-sky-50 text-sky-800 ring-sky-200",
  all: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  mixed: "bg-violet-50 text-violet-800 ring-violet-200",
};
const DOT: Record<string, string> = { none: "bg-line", own: "bg-amber-500", team: "bg-orange-500", branch: "bg-sky-500", all: "bg-emerald-500", mixed: "bg-violet-500" };

export function scopeOptions(scoped: boolean): Opt[] {
  return scoped
    ? [
        { value: "none", label: "No access", short: "None", about: "Can't see or do this" },
        { value: "own", label: "Only their own items", short: "Own", about: "Records they're responsible for" },
        { value: "team", label: "Their team's items", short: "Team", about: "Theirs + everyone reporting to them" },
        { value: "branch", label: "Their branch's items", short: "Branch", about: "Everything in their branch" },
        { value: "all", label: "Everything", short: "All", about: "The whole company" },
      ]
    : [
        { value: "none", label: "No access", short: "None", about: "Can't use this" },
        { value: "all", label: "Allowed", short: "Allowed", about: "Can use this" },
      ];
}

/** A small animated menu anchored to a button; rendered in <body> so the scrolling table never clips it. */
function Menu({ anchor, options, value, title, onPick, onClose }: {
  anchor: HTMLElement; options: Opt[]; value: string; title?: string; onPick: (v: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 220;
    const w = ref.current?.offsetWidth ?? 240;
    const below = r.bottom + 6 + h < window.innerHeight;
    setPos({ top: below ? r.bottom + 6 : r.top - 6 - h, left: Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8) });
  }, [anchor]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { onClose(); anchor.focus(); } };
    // Close when the page or table scrolls, but not for the tiny scroll focusing the menu can cause right after opening.
    const opened = Date.now();
    const scroll = (e: Event) => { if (Date.now() - opened > 200 && !ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", onClose);
    (ref.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ?? ref.current?.querySelector<HTMLButtonElement>("button"))?.focus({ preventScroll: true });
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); window.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", onClose); };
  }, [anchor, onClose]);
  const move = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };
  return createPortal(
    <div ref={ref} role="listbox" onKeyDown={move} style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden", top: 0, left: 0 }}
      className="anim-pop fixed z-[60] w-60 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-xl ring-1 ring-black/5">
      {title && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</p>}
      {options.map((o) => (
        <button key={o.value} type="button" role="option" aria-selected={o.value === value} onClick={() => onPick(o.value)}
          className={cn("flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left outline-none transition-colors hover:bg-canvas focus-visible:bg-canvas", o.value === value && "bg-canvas")}>
          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[o.value])} />
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink">{o.label}</span><span className="block text-xs text-muted">{o.about}</span></span>
          {o.value === value && <Check className="mt-0.5 size-4 shrink-0 text-navy-900" />}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/** A coloured access pill that opens the menu; shows a spinner while saving and flashes green when saved. */
function Pill({ value, options, disabled, onPick, title, mixedLabel }: {
  value: string; options: Opt[]; disabled?: boolean; onPick: (v: string) => Promise<boolean>; title: string; mixedLabel?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<"" | "ok" | "bad">("");
  const opt = options.find((o) => o.value === value);
  const pick = (v: string) => {
    setOpen(false);
    if (v === value) return;
    start(async () => {
      const ok = await onPick(v);
      setFlash(ok ? "ok" : "bad");
      setTimeout(() => setFlash(""), 900);
    });
  };
  return (
    <>
      <button ref={btn} type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} title={opt ? `${title}: ${opt.label}` : title}
        className={cn(
          "inline-flex h-7 min-w-[4.25rem] items-center justify-center gap-1 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset transition-all duration-200 ease-out",
          PILL[mixedLabel ? "mixed" : value],
          !disabled && "hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:scale-95",
          disabled && "cursor-default opacity-90",
          open && "ring-2 ring-navy-900/40",
          flash === "ok" && "ring-2 ring-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]",
          flash === "bad" && "ring-2 ring-red-500",
        )}>
        {pending ? <Loader2 className="size-3 animate-spin" /> : flash === "ok" ? <Check className="size-3" /> : null}
        <span className="truncate">{mixedLabel ?? opt?.short ?? value}</span>
      </button>
      {open && btn.current && <Menu anchor={btn.current} options={options} value={mixedLabel ? "" : value} title={mixedLabel ? "Set every action to" : undefined} onPick={pick} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * One section of the matrix (e.g. Leads): a summary row with each role's overall access, and the individual actions
 * underneath, sliding open on click. Values live here so the summary updates the moment a cell changes.
 */
export function ModuleBlock({ moduleKey, label, scoped, actions, roles, initial, canEdit, defaultOpen, extraCol }: {
  moduleKey: string; label: string; scoped: boolean; actions: { key: string; label: string }[]; roles: Role[];
  initial: Record<string, Record<string, string>>; canEdit: boolean; defaultOpen: boolean; extraCol: boolean;
}) {
  const options = scopeOptions(scoped);
  const [values, setValues] = useState(initial);
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    const on = (e: Event) => setOpen((e as CustomEvent<boolean>).detail);
    // Clicking the section in the left menu (#m-leads) opens it.
    const hash = () => { if (location.hash === `#m-${moduleKey}`) setOpen(true); };
    hash();
    window.addEventListener("perm:expand", on);
    window.addEventListener("hashchange", hash);
    return () => { window.removeEventListener("perm:expand", on); window.removeEventListener("hashchange", hash); };
  }, [moduleKey]);

  const setCell = (roleId: string, action: string, v: string) => setValues((s) => ({ ...s, [roleId]: { ...s[roleId], [action]: v } }));
  const summary = (roleId: string) => {
    const vs = actions.map((a) => values[roleId]?.[a.key] ?? "none");
    const same = vs.every((v) => v === vs[0]);
    return same ? { value: vs[0]!, mixed: undefined } : { value: "mixed", mixed: `${vs.filter((v) => v !== "none").length}/${vs.length} on` };
  };

  return (
    <tbody id={`m-${moduleKey}`} className="scroll-mt-28">
      <tr className="group/head">
        <td className="sticky left-0 z-10 border-b border-r border-line bg-surface p-0">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
            className="flex w-full items-center gap-2 px-4 py-3 text-left font-medium transition-colors hover:bg-canvas">
            <ChevronRight className={cn("size-4 shrink-0 text-muted transition-transform duration-300 ease-out", open && "rotate-90")} />
            <span className="truncate">{label}</span>
            <span className="ml-auto shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-normal text-muted">{actions.length}</span>
          </button>
        </td>
        {roles.map((r) => {
          const s = summary(r.id);
          return (
            <td key={r.id} className="border-b border-r border-line bg-surface px-2 py-2 text-center transition-colors group-hover/head:bg-canvas/50">
              <Pill value={s.value} mixedLabel={s.mixed} options={options} disabled={!canEdit} title={`${r.name} · ${label} (all actions)`}
                onPick={async (v) => {
                  const res = await setModuleForRole(r.id, moduleKey, v);
                  if (!res.error) for (const a of actions) setCell(r.id, a.key, v);
                  return !res.error;
                }} />
            </td>
          );
        })}
        {extraCol && <td className="border-b border-line bg-surface" />}
      </tr>
      {open && actions.map((a, i) => (
        <tr key={a.key} className="perm-row group" style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}>
          <td className="sticky left-0 z-10 border-b border-r border-line bg-canvas/40 py-2 pl-10 pr-4 text-[13px] text-ink/75 backdrop-blur group-hover:bg-canvas">{a.label}</td>
          {roles.map((r) => (
            <td key={r.id} className="border-b border-r border-line bg-canvas/20 px-2 py-1.5 text-center transition-colors group-hover:bg-canvas/70">
              <Pill value={values[r.id]?.[a.key] ?? "none"} options={options} disabled={!canEdit} title={`${r.name} · ${label} · ${a.label}`}
                onPick={async (v) => {
                  const res = await setPermission(r.id, moduleKey, a.key, v);
                  if (!res.error) setCell(r.id, a.key, v);
                  return !res.error;
                }} />
            </td>
          ))}
          {extraCol && <td className="border-b border-line bg-canvas/20" />}
        </tr>
      ))}
    </tbody>
  );
}

/** Expand / collapse every section at once. */
export function ExpandAll() {
  return (
    <span className="inline-flex overflow-hidden rounded-lg border border-line bg-surface text-xs">
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("perm:expand", { detail: true }))} className="px-3 py-2 transition-colors hover:bg-canvas">Expand all</button>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("perm:expand", { detail: false }))} className="border-l border-line px-3 py-2 transition-colors hover:bg-canvas">Collapse all</button>
    </span>
  );
}

/** The colour key under the table. */
export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      {scopeOptions(true).map((o) => (
        <span key={o.value} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ring-inset", PILL[o.value])}><span className={cn("size-1.5 rounded-full", DOT[o.value])} />{o.short} · {o.about}</span>
      ))}
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ring-inset", PILL.mixed)}><span className={cn("size-1.5 rounded-full", DOT.mixed)} />Mixed · some actions on</span>
    </div>
  );
}
