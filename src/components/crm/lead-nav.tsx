"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fetchLeadList } from "@/app/(app)/crm/leads/list-actions";

/** The lead list you came from (saved by the Leads page): its rows in order, which page, and how to fetch more. */
export type LeadNavState = { ids: string[]; page: number; pages: number; total: number; size: number; query: string };
export const LEAD_NAV_KEY = "ams:leadnav";

export function saveLeadNav(s: LeadNavState) {
  try { sessionStorage.setItem(LEAD_NAV_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}
function readNav(): LeadNavState | null {
  try { return JSON.parse(sessionStorage.getItem(LEAD_NAV_KEY) ?? "null"); } catch { return null; }
}

/** "‹ 3 of 50 ›" on a lead: previous / next lead in the list you opened it from, across its pages. */
export function LeadNav({ id }: { id: string }) {
  const router = useRouter();
  const [nav, setNav] = useState<LeadNavState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setNav(readNav()), [id]);
  const i = nav ? nav.ids.indexOf(id) : -1;
  if (!nav || i < 0) return null;
  const pos = (nav.page - 1) * nav.size + i + 1;
  const go = async (dir: 1 | -1) => {
    let ids = nav.ids, page = nav.page, j = i + dir;
    if (j < 0 || j >= ids.length) {
      // End of this page of the list: fetch the next / previous page with the same filters.
      page += dir;
      if (page < 1 || page > nav.pages) return;
      setBusy(true);
      try {
        const data = await fetchLeadList(nav.query, "list", page, nav.size);
        ids = data.rows.map((r) => r.id);
        saveLeadNav({ ...nav, ids, page, pages: Math.max(1, Math.ceil(data.total / nav.size)), total: data.total });
        j = dir === 1 ? 0 : ids.length - 1;
      } finally { setBusy(false); }
    }
    if (ids[j]) router.push(`/crm/leads/${ids[j]}`);
  };
  const atStart = pos <= 1, atEnd = pos >= nav.total;
  // Keyboard: Alt + ← / → (not while typing).
  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5 text-sm" aria-label="Lead navigation">
      <button type="button" onClick={() => go(-1)} disabled={atStart || busy} className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink disabled:opacity-30" aria-label="Previous lead" title="Previous lead (Alt + ←)"><ChevronLeft className="size-4" /></button>
      <span className="px-1 tabular-nums text-muted">{pos.toLocaleString()} of {nav.total.toLocaleString()}</span>
      <button type="button" onClick={() => go(1)} disabled={atEnd || busy} className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink disabled:opacity-30" aria-label="Next lead" title="Next lead (Alt + →)"><ChevronRight className="size-4" /></button>
      <KeyNav onPrev={() => !atStart && go(-1)} onNext={() => !atEnd && go(1)} />
    </div>
  );
}

function KeyNav({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!e.altKey || (e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); onPrev(); }
      if (e.key === "ArrowRight") { e.preventDefault(); onNext(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  return null;
}
