"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CircleHelp, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type HelpItem = { key: string; title: string; summary: string; steps: string[]; tips?: string[]; paths: string[] };

const clean = (p: string) => p.split("?")[0]!.split("#")[0]!.replace(/\/+$/, "") || "/";

/**
 * The "?" help button on every page: opens the guide(s) for the page you're on (e.g. everything about Salary
 * Revisions on Salary Revisions), only from the sections this person uses. Hidden on pages with no guide.
 */
export function PageHelp({ items }: { items: HelpItem[] }) {
  const pathname = clean(usePathname());
  const [open, setOpen] = useState(false);
  // Best match: exact page first, then the closest parent page (/hr/payroll/payslips → /hr/payroll).
  const matches = useMemo(() => {
    let best = -1;
    const scored = items.map((t) => {
      let score = -1;
      for (const p of t.paths.map(clean)) {
        if (p === pathname) score = Math.max(score, 1000);
        else if (pathname.startsWith(`${p}/`)) score = Math.max(score, p.length);
      }
      best = Math.max(best, score);
      return { t, score };
    });
    return best < 0 ? [] : scored.filter((x) => x.score === best).map((x) => x.t);
  }, [items, pathname]);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);
  if (!matches.length) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="How to use this page" title="How to use this page"
        className="fixed bottom-20 right-4 z-40 flex size-11 items-center justify-center rounded-full bg-navy-900 text-white shadow-lg ring-4 ring-white/60 transition hover:scale-105 hover:bg-navy-800 lg:bottom-24 lg:right-6 print:hidden">
        <CircleHelp className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true" aria-label="Help for this page">
          <div className="anim-fade absolute inset-0 bg-navy-950/30" onClick={() => setOpen(false)} />
          <aside className="anim-pop absolute bottom-0 right-0 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:bottom-6 sm:right-6 sm:w-[26rem] sm:rounded-2xl">
            <header className="flex items-center gap-2 border-b border-line px-5 py-3">
              <CircleHelp className="size-5 text-gold-600" />
              <h2 className="flex-1 font-semibold">How to use this page</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink"><X className="size-4" /></button>
            </header>
            <div className="space-y-5 overflow-y-auto px-5 py-4">
              {matches.map((t) => (
                <section key={t.key}>
                  <h3 className="font-medium">{t.title}</h3>
                  <p className="mb-2 text-sm text-muted">{t.summary}</p>
                  <ol className="list-decimal space-y-1.5 pl-5 text-sm">{t.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                  {t.tips?.length ? <ul className="mt-2 space-y-1 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">{t.tips.map((s, i) => <li key={i}>💡 {s}</li>)}</ul> : null}
                </section>
              ))}
            </div>
            <footer className={cn("border-t border-line px-5 py-3 text-right text-sm")}>
              <Link href="/help" className="font-medium text-navy-900 hover:underline">All tutorials →</Link>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}
