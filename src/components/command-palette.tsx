"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, Contact, CornerDownLeft, Handshake, LayoutGrid, Loader2, Search, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ICONS } from "./nav-icons";

type Hit = { title: string; sub?: string; href: string; icon?: string; path?: string[] };
type Group = { label: string; items: Hit[] };

const GROUP_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  Pages: LayoutGrid, Leads: Target, Deals: Handshake, Contacts: Contact, Inventory: Building2, Employees: Users,
};

/** Opens the palette from anywhere (sidebar button, phone top bar). */
export const openSearch = () => window.dispatchEvent(new Event("open-search"));

/** Ctrl+E / ⌘E: jump to a page or find a lead, deal, contact, unit or employee. */
export function CommandPalette({ pages }: { pages: { href: string; label: string; icon: string; path?: string[] }[] }) {
  const router = useRouter();
  const [state, setState] = useState<"closed" | "open" | "closing">("closed");
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  // Play the exit animation before unmounting.
  const close = useCallback(() => setState((s) => (s === "open" ? "closing" : s)), []);
  useEffect(() => {
    if (state !== "closing") return;
    const t = setTimeout(() => setState("closed"), 140);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setState((s) => (s === "open" ? "closing" : "open"));
      }
    };
    const onOpen = () => setState("open");
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-search", onOpen);
    };
  }, []);

  useEffect(() => {
    if (state !== "open") return;
    setQ("");
    setGroups([]);
    setActive(0);
    input.current?.focus();
    const scrollY = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = scrollY; };
  }, [state]);

  // Debounced server search; older responses are cancelled.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setGroups([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { groups: [] }))
        .then((d: { groups: Group[] }) => { setGroups(d.groups); setLoading(false); setActive(0); })
        .catch(() => {});
    }, 120);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  // Pages match on their name and where they live ("hr settings", "tutorials my space"); best matches first:
  // name starts with the words, then name contains them, then the path does.
  const all = useMemo((): Group[] => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return groups;
    const scored = pages.map((p) => {
      const name = p.label.toLowerCase(), hay = `${name} ${(p.path ?? []).join(" ").toLowerCase()}`;
      if (!words.every((w) => hay.includes(w))) return null;
      // Exact name first; apps and app areas (CRM › Calls) before single pages; tutorials and help after real pages.
      const kind = p.path?.[0] === "App" ? -0.6 : p.path?.length === 1 && p.path[0] !== "Tutorials" ? -0.4 : p.path?.[0] === "Tutorials" ? 0.8 : 0;
      const score = (name === words.join(" ") ? -1 : name.startsWith(words[0]!) ? 0 : words.every((w) => name.includes(w)) ? 1 : 2) + kind;
      return { p, score };
    }).filter((x): x is { p: (typeof pages)[number]; score: number } => !!x).sort((a, b) => a.score - b.score || a.p.label.length - b.p.label.length).slice(0, 8);
    return [...(scored.length ? [{ label: "Pages", items: scored.map(({ p }) => ({ title: p.label, href: p.href, icon: p.icon, path: p.path })) }] : []), ...groups];
  }, [q, pages, groups]);
  const apps = useMemo(() => pages.filter((p) => p.path?.[0] === "App"), [pages]);
  const flat = all.flatMap((g) => g.items);
  const current = Math.min(active, Math.max(flat.length - 1, 0));

  /** newTab: Shift + Enter (or Ctrl/Cmd + click) opens the result in a new browser tab. */
  function go(hit: Hit | undefined, newTab = false) {
    if (!hit) return;
    close();
    if (newTab) window.open(hit.href, "_blank", "noopener");
    else router.push(hit.href);
  }

  function move(next: number) {
    setActive(next);
    list.current?.querySelector(`[data-i="${next}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown" && flat.length) { e.preventDefault(); move((current + 1) % flat.length); }
    else if (e.key === "ArrowUp" && flat.length) { e.preventDefault(); move((current - 1 + flat.length) % flat.length); }
    else if (e.key === "Enter") { e.preventDefault(); go(flat[current], e.shiftKey || e.ctrlKey || e.metaKey); }
  }

  if (state === "closed") return null;
  const leaving = state === "closing";
  let i = -1;
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-start sm:px-4 sm:pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
      <div className={cn("absolute inset-0 bg-navy-950/50", leaving ? "palette-backdrop-out" : "anim-fade")} onClick={close} />
      <div
        className={cn(
          "relative flex w-full flex-col overflow-hidden bg-surface shadow-2xl ring-1 ring-black/5 sm:max-h-[72vh] sm:max-w-2xl sm:rounded-2xl",
          leaving ? "palette-out" : "palette-in",
        )}
        onKeyDown={onKeyDown}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
          <button onClick={close} className="rounded-md p-1.5 text-muted hover:text-ink sm:hidden" aria-label="Close search"><ArrowLeft className="size-5" /></button>
          <span className="hidden size-5 items-center justify-center text-muted sm:flex">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </span>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages, leads, deals, people…"
            className="palette-input h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted/80 sm:text-[15px]"
            role="combobox"
            aria-expanded
            aria-controls="search-results"
            aria-activedescendant={flat.length ? `search-${current}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          {loading && <Loader2 className="size-4 animate-spin text-muted sm:hidden" />}
          {q && <button onClick={() => { setQ(""); input.current?.focus(); }} className="rounded-md px-2 py-1 text-xs text-muted hover:bg-canvas hover:text-ink">Clear</button>}
          <kbd className="hidden rounded-md border border-line bg-canvas px-1.5 py-0.5 font-sans text-[10px] text-muted sm:block">Esc</kbd>
        </div>

        <div
          ref={list}
          id="search-results"
          role="listbox"
          className="flex-1 overflow-y-auto overscroll-contain p-2"
          onPointerMove={(e) => { pointer.current = { x: e.clientX, y: e.clientY }; }}
        >
          {all.map((g) => {
            const GroupIcon = GROUP_ICON[g.label] ?? LayoutGrid;
            return (
              <div key={g.label} className="palette-group pb-1">
                <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted"><GroupIcon className="size-3.5" />{g.label}<span className="font-normal normal-case tracking-normal text-muted/70">· {g.items.length}</span></p>
                {g.items.map((hit) => {
                  const idx = ++i;
                  const on = idx === current;
                  // Pages show their own sidebar icon; records show their type's icon.
                  const Icon = (hit.icon && NAV_ICONS[hit.icon]) || GroupIcon;
                  return (
                    <button
                      key={`${hit.href}|${hit.title}`}
                      id={`search-${idx}`}
                      data-i={idx}
                      role="option"
                      aria-selected={on}
                      // Only follow the mouse when it actually moves, so a resting pointer doesn't steal the selection.
                      onPointerEnter={(e) => pointer.current && (pointer.current.x !== e.clientX || pointer.current.y !== e.clientY) && setActive(idx)}
                      onClick={(e) => go(hit, e.shiftKey || e.ctrlKey || e.metaKey)}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-100",
                        on ? "bg-navy-900/[0.06]" : "hover:bg-canvas",
                      )}
                    >
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md transition-colors", on ? "bg-navy-900 text-white" : "bg-canvas text-muted")}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium"><Mark text={hit.title} q={q} /></span>
                        {hit.path?.length ? (
                          <span className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-xs text-muted">
                            {hit.path[0] === "App" ? <span className="rounded bg-navy-900/[0.07] px-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink/70">App</span>
                              : hit.path.map((part, k) => <span key={k} className="flex items-center gap-1">{k > 0 && <span className="text-muted/60">›</span>}<span className={k === 0 ? "font-medium text-ink/70" : ""}>{part}</span></span>)}
                          </span>
                        ) : hit.sub ? <span className="block truncate text-xs text-muted">{hit.sub}</span> : null}
                      </span>
                      <CornerDownLeft className={cn("size-4 shrink-0 text-muted transition-opacity", on ? "opacity-100" : "opacity-0")} />
                    </button>
                  );
                })}
              </div>
            );
          })}
          {q.trim().length >= 2 && !loading && all.length === 0 && (
            <p className="px-3 py-10 text-center text-sm text-muted">Nothing matches “{q.trim()}”.</p>
          )}
          {!q.trim() && (
            // Empty box: your apps as quick tiles.
            <div className="p-1">
              <p className="px-1.5 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Go to</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {apps.map((a) => {
                  const Icon = NAV_ICONS[a.icon] ?? LayoutGrid;
                  return (
                    <button key={a.href} onClick={() => go({ title: a.label, href: a.href })} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2.5 text-left text-sm font-medium transition hover:border-navy-900/30 hover:bg-canvas">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-navy-900 text-white"><Icon className="size-4" /></span>{a.label}
                    </button>
                  );
                })}
              </div>
              <p className="px-1.5 pb-1 pt-4 text-xs text-muted">Type to find any page, or a lead, deal, contact, unit or employee by name, phone or number.</p>
            </div>
          )}
          {q.trim().length === 1 && <p className="px-3 pb-2 pt-3 text-xs text-muted">Keep typing to search records too…</p>}
        </div>

        <div className="hidden shrink-0 items-center gap-4 border-t border-line bg-canvas/60 px-4 py-2 text-[11px] text-muted sm:flex">
          <span><kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> to move</span>
          <span><kbd className="font-sans">↵</kbd> to open</span>
          <span><kbd className="font-sans">Shift</kbd> + <kbd className="font-sans">↵</kbd> new tab</span>
          <span className="ml-auto">Ctrl E to toggle</span>
        </div>
      </div>
    </div>
  );
}

/** The typed words highlighted inside a result's name. */
function Mark({ text, q }: { text: string; q: string }) {
  const words = q.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return <>{text.split(re).map((part, i) => (words.includes(part.toLowerCase()) ? <mark key={i} className="rounded-sm bg-gold-300/50 px-0.5 text-inherit">{part}</mark> : part))}</>;
}
