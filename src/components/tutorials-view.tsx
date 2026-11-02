"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, PlayCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { TUTORIAL_GROUPS, type Tutorial } from "@/lib/tutorials";

export type Chapter = { key: string; title: string; start: number };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Help page body: the full video tour with chapters, then searchable step-by-step tutorials. */
export function TutorialsView({ tutorials, chapters, video }: { tutorials: Tutorial[]; chapters: Chapter[]; video: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [q, setQ] = useState("");
  const [now, setNow] = useState(0);
  const play = (start: number) => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = start;
    void v.play();
    v.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const chapterAt = [...chapters].reverse().find((c) => c.start <= now);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return tutorials;
    return tutorials.filter((x) => [x.title, x.summary, x.who, x.group, ...x.steps, ...(x.tips ?? [])].join(" ").toLowerCase().includes(t));
  }, [q, tutorials]);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="bg-navy-950">
            {video ? (
              <video ref={ref} src={video} controls preload="metadata" playsInline className="aspect-video w-full" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
            ) : (
              <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-white/70">The full video tour is being prepared. Meanwhile, every step is written out below.</div>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto border-t border-line p-3 lg:border-l lg:border-t-0">
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">Full tour · chapters</p>
            {chapters.map((c) => (
              <button key={c.key} type="button" onClick={() => play(c.start)} disabled={!video}
                className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-canvas disabled:opacity-50", chapterAt?.key === c.key && "bg-navy-900/5 font-medium")}>
                <PlayCircle className="size-4 shrink-0 text-gold-600" /><span className="flex-1">{c.title}</span><span className="text-xs tabular-nums text-muted">{fmt(c.start)}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="relative">
        <Search className="absolute left-3 top-3 size-4 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tutorials (e.g. leave, payslip, import, two-step)" aria-label="Search tutorials" className="input h-11 pl-9" />
      </div>

      {TUTORIAL_GROUPS.map((g) => {
        const items = shown.filter((t) => t.group === g);
        if (!items.length) return null;
        return (
          <section key={g}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{g}</h2>
            <div className="space-y-2">
              {items.map((t) => {
                const ch = chapters.find((c) => c.key === t.chapter);
                return (
                  <details key={t.key} id={t.key} className="group rounded-xl border border-line bg-surface" open={!!q.trim() && items.length <= 3}>
                    <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{t.title}</span>
                        <span className="block text-sm text-muted">{t.summary}</span>
                      </span>
                      <span className="hidden shrink-0 rounded-full bg-canvas px-2 py-0.5 text-xs text-muted sm:inline">{t.who}</span>
                      <ChevronDown className="mt-1 size-4 shrink-0 text-muted transition group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-line px-4 py-4">
                      <ol className="list-decimal space-y-2 pl-5 text-sm">{t.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                      {t.tips?.length ? <ul className="mt-3 space-y-1 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">{t.tips.map((s, i) => <li key={i}>💡 {s}</li>)}</ul> : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {ch && video && <button type="button" onClick={() => play(ch.start)} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-canvas"><PlayCircle className="size-4 text-gold-600" /> Watch this part ({fmt(ch.start)})</button>}
                        {t.href && <Link href={t.href} className="inline-flex items-center rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800">Open it</Link>}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        );
      })}
      {!shown.length && <p className="text-center text-sm text-muted">No tutorial matches “{q}”.</p>}
    </div>
  );
}
