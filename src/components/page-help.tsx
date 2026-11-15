"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CircleHelp, GraduationCap, Lightbulb, PlayCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TutorialPlayer, type Chapter } from "./tutorial-player";

export type HelpItem = { key: string; title: string; summary: string; paths: string[]; video?: string };
type Steps = Record<string, { steps: string[]; tips: string[] }>;

const clean = (p: string) => p.split("?")[0]!.split("#")[0]!.replace(/\/+$/, "") || "/";

/**
 * The "?" help button on every page: opens the how-to video(s) for the page you're on, with the steps beside the
 * video (they follow it, click one to jump). Only guides for sections this person uses. Hidden where there's none.
 */
export function PageHelp({ items }: { items: HelpItem[] }) {
  const pathname = clean(usePathname());
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [steps, setSteps] = useState<Steps>({});
  const [chapters, setChapters] = useState<Record<string, Chapter[] | null>>({});
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
  useEffect(() => { setOpen(false); setActive(0); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = ""; };
  }, [open]);
  const t = matches[active] ?? matches[0];
  // Steps and video chapters are fetched when the popup opens (not sent with every page).
  useEffect(() => {
    if (!open || !t) return;
    if (!steps[t.key]) fetch(`/api/help?keys=${t.key}`).then((r) => (r.ok ? r.json() : [])).then((rows: { key: string; steps: string[]; tips: string[] }[]) => setSteps((s) => ({ ...s, ...Object.fromEntries(rows.map((r) => [r.key, { steps: r.steps, tips: r.tips }])) }))).catch(() => {});
    if (t.video && !(t.key in chapters)) fetch(`/tutorials/sections/${t.key}.json`).then((r) => (r.ok ? r.json() : null)).then((j: { chapters?: Chapter[] } | null) => setChapters((c) => ({ ...c, [t.key]: j?.chapters ?? null }))).catch(() => setChapters((c) => ({ ...c, [t.key]: null })));
  }, [open, t, steps, chapters]);
  if (!matches.length || !t) return null;
  const s = steps[t.key];
  const ch = chapters[t.key];

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="How to use this page" title="How to use this page"
        className="fixed bottom-20 right-4 z-40 flex size-11 items-center justify-center rounded-full bg-navy-900 text-white shadow-lg ring-4 ring-white/60 transition hover:scale-105 hover:bg-navy-800 lg:bottom-24 lg:right-6 print:hidden">
        <CircleHelp className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6 print:hidden" role="dialog" aria-modal="true" aria-label={`How to: ${t.title}`}>
          <div className="anim-fade absolute inset-0 bg-navy-950/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="anim-pop relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl ring-1 ring-black/5 sm:max-w-3xl sm:rounded-2xl">
            <header className="flex items-start gap-3 border-b border-line px-5 py-3.5">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-gold-400/15 text-gold-700"><GraduationCap className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gold-700">How to</p>
                <h2 className="truncate font-semibold leading-tight">{t.title}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink"><X className="size-4" /></button>
            </header>
            {matches.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto border-b border-line px-5 py-2">{matches.map((v, i) => (
                <button key={v.key} type="button" onClick={() => setActive(i)} className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors", i === active ? "border-navy-900 bg-navy-900 text-white" : "border-line text-muted hover:text-ink")}><PlayCircle className="size-3.5" />{v.title}</button>
              ))}</div>
            )}
            <div className="overflow-y-auto">
              {t.video ? (
                <TutorialPlayer key={t.key} src={t.video} poster={t.video.replace(/\.mp4$/, ".jpg")} chapters={ch ?? null} steps={ch ? undefined : [t.summary, ...(s?.steps ?? [])]} />
              ) : (
                <div className="px-5 py-4">
                  <p className="mb-3 text-sm text-muted">{t.summary}</p>
                  {s ? <ol className="list-decimal space-y-1.5 pl-5 text-sm">{s.steps.map((x, i) => <li key={i}>{x}</li>)}</ol> : <p className="text-xs text-muted">Loading…</p>}
                </div>
              )}
              {s?.tips.length ? (
                <div className="mx-5 mb-4 flex gap-2 rounded-xl bg-sky-50 px-3.5 py-2.5 text-sm text-sky-900"><Lightbulb className="mt-0.5 size-4 shrink-0" /><ul className="space-y-1">{s.tips.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
              ) : null}
            </div>
            <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm">
              <span className="truncate text-xs text-muted">{t.summary}</span>
              <Link href="/help" className="shrink-0 font-medium text-navy-900 hover:underline">All tutorials →</Link>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
