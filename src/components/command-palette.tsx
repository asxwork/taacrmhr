"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Hit = { title: string; sub?: string; href: string };
type Group = { label: string; items: Hit[] };

/** Opens the palette from anywhere (sidebar button, phone top bar). */
export const openSearch = () => window.dispatchEvent(new Event("open-search"));

/** Ctrl+K / ⌘K: jump to a page or find a lead, deal, contact, unit or employee. */
export function CommandPalette({ pages }: { pages: { href: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-search", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setGroups([]);
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  // Debounced server search; stale responses are ignored.
  useEffect(() => {
    if (q.trim().length < 2) {
      setGroups([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { groups: [] }))
        .then((d: { groups: Group[] }) => { setGroups(d.groups); setLoading(false); setActive(0); })
        .catch(() => {});
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const all = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pageHits: Group = { label: "Pages", items: pages.filter((p) => !needle || p.label.toLowerCase().includes(needle)).slice(0, needle ? 5 : 8).map((p) => ({ title: p.label, href: p.href })) };
    return [...(pageHits.items.length ? [pageHits] : []), ...groups];
  }, [q, pages, groups]);
  const flat = all.flatMap((g) => g.items);

  function go(hit: Hit | undefined) {
    if (!hit) return;
    setOpen(false);
    router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (active + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % Math.max(flat.length, 1);
      setActive(next);
      list.current?.querySelector(`[data-i="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[active]);
    }
  }

  if (!open) return null;
  let i = -1;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
      <div className="anim-fade absolute inset-0 bg-navy-950/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div className="anim-page relative w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-2xl" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          {loading ? <Loader2 className="size-4 shrink-0 animate-spin text-muted" /> : <Search className="size-4 shrink-0 text-muted" />}
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search leads, deals, contacts, units, employees or pages…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            role="combobox"
            aria-expanded
            aria-controls="search-results"
            aria-activedescendant={flat.length ? `search-${active}` : undefined}
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">Esc</kbd>
        </div>
        <div ref={list} id="search-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {all.map((g) => (
            <div key={g.label} className="mb-1">
              <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted">{g.label}</p>
              {g.items.map((hit) => {
                i++;
                const idx = i;
                return (
                  <button
                    key={hit.href}
                    id={`search-${idx}`}
                    data-i={idx}
                    role="option"
                    aria-selected={idx === active}
                    onMouseMove={() => setActive(idx)}
                    onClick={() => go(hit)}
                    className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", idx === active ? "bg-navy-900/[0.06]" : "")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{hit.title}</span>
                      {hit.sub && <span className="block truncate text-xs text-muted">{hit.sub}</span>}
                    </span>
                    {idx === active && <ArrowRight className="size-4 shrink-0 text-muted" />}
                  </button>
                );
              })}
            </div>
          ))}
          {q.trim().length >= 2 && !loading && flat.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted">Nothing found for “{q.trim()}”.</p>}
        </div>
      </div>
    </div>
  );
}
