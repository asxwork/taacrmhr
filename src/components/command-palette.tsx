"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, Contact, CornerDownLeft, Handshake, LayoutGrid, Loader2, Search, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type Hit = { title: string; sub?: string; href: string };
type Group = { label: string; items: Hit[] };

const GROUP_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  Pages: LayoutGrid, Leads: Target, Deals: Handshake, Contacts: Contact, Inventory: Building2, Employees: Users,
};

/** Opens the palette from anywhere (sidebar button, phone top bar). */
export const openSearch = () => window.dispatchEvent(new Event("open-search"));

/** Ctrl+K / ⌘K: jump to a page or find a lead, deal, contact, unit or employee. */
export function CommandPalette({ pages }: { pages: { href: string; label: string }[] }) {
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
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

  const all = useMemo((): Group[] => {
    const needle = q.trim().toLowerCase();
    const matches = pages.filter((p) => !needle || p.label.toLowerCase().includes(needle)).slice(0, needle ? 4 : 6);
    return [...(matches.length ? [{ label: "Pages", items: matches.map((p) => ({ title: p.label, href: p.href })) }] : []), ...groups];
  }, [q, pages, groups]);
  const flat = all.flatMap((g) => g.items);
  const current = Math.min(active, Math.max(flat.length - 1, 0));

  function go(hit: Hit | undefined) {
    if (!hit) return;
    close();
    router.push(hit.href);
  }

  function move(next: number) {
    setActive(next);
    list.current?.querySelector(`[data-i="${next}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown" && flat.length) { e.preventDefault(); move((current + 1) % flat.length); }
    else if (e.key === "ArrowUp" && flat.length) { e.preventDefault(); move((current - 1 + flat.length) % flat.length); }
    else if (e.key === "Enter") { e.preventDefault(); go(flat[current]); }
  }

  if (state === "closed") return null;
  const leaving = state === "closing";
  let i = -1;
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-start sm:px-4 sm:pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
      <div className={cn("absolute inset-0 bg-navy-950/45 backdrop-blur-[2px]", leaving ? "palette-backdrop-out" : "anim-fade")} onClick={close} />
      <div
        className={cn(
          "relative flex w-full flex-col overflow-hidden bg-surface shadow-2xl ring-1 ring-black/5 sm:max-h-[70vh] sm:max-w-xl sm:rounded-2xl",
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
            placeholder="Search leads, deals, people…"
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
            const Icon = GROUP_ICON[g.label] ?? LayoutGrid;
            return (
              <div key={g.label} className="palette-group pb-1">
                <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted">{g.label}</p>
                {g.items.map((hit) => {
                  const idx = ++i;
                  const on = idx === current;
                  return (
                    <button
                      key={hit.href}
                      id={`search-${idx}`}
                      data-i={idx}
                      role="option"
                      aria-selected={on}
                      // Only follow the mouse when it actually moves, so a resting pointer doesn't steal the selection.
                      onPointerEnter={(e) => pointer.current && (pointer.current.x !== e.clientX || pointer.current.y !== e.clientY) && setActive(idx)}
                      onClick={() => go(hit)}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-100",
                        on ? "bg-navy-900/[0.06]" : "hover:bg-canvas",
                      )}
                    >
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md transition-colors", on ? "bg-navy-900 text-white" : "bg-canvas text-muted")}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{hit.title}</span>
                        {hit.sub && <span className="block truncate text-xs text-muted">{hit.sub}</span>}
                      </span>
                      <CornerDownLeft className={cn("size-4 shrink-0 text-muted transition-opacity", on ? "opacity-100" : "opacity-0")} />
                    </button>
                  );
                })}
              </div>
            );
          })}
          {q.trim().length >= 2 && !loading && groups.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted">No records match “{q.trim()}”.</p>
          )}
          {q.trim().length < 2 && <p className="px-3 pb-2 pt-3 text-xs text-muted">Type at least 2 letters to search leads, deals, contacts, units and employees.</p>}
        </div>

        <div className="hidden shrink-0 items-center gap-4 border-t border-line bg-canvas/60 px-4 py-2 text-[11px] text-muted sm:flex">
          <span><kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> to move</span>
          <span><kbd className="font-sans">↵</kbd> to open</span>
          <span className="ml-auto">Ctrl K to toggle</span>
        </div>
      </div>
    </div>
  );
}
