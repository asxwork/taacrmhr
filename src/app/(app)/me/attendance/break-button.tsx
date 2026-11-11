"use client";

import { useEffect, useState, useTransition } from "react";
import { Coffee, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleBreak } from "./actions";

/** Break Out / Back button, with a live "on break" timer and today's break total. */
export function BreakButton({ onBreakSince, todayMin, disabled }: { onBreakSince: string | null; todayMin: number; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Times are worked out in the browser only (server and browser clocks / time zones differ).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); if (!onBreakSince) return; const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, [onBreakSince]);
  const since = onBreakSince ? new Date(onBreakSince) : null;
  const live = since && now ? Math.max(0, Math.round((now - +since) / 60000)) : 0;
  const total = todayMin + live;
  return (
    <div className="space-y-1">
      <button type="button" disabled={disabled || pending} onClick={() => start(async () => { const r = await toggleBreak(); setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: r?.message ?? "" }); })}
        className={cn("flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-60",
          since ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-line bg-surface hover:bg-canvas")}>
        {since ? <><Play className="size-4" /> Back from break</> : <><Coffee className="size-4" /> Break out</>}
      </button>
      <p className="text-center text-xs text-muted">
        {since ? (now ? `On break since ${since.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${live} min` : "On break") : total ? `Breaks today: ${total} min` : "Breaks are taken off your worked time."}
      </p>
      {msg && !msg.ok && <p className="text-center text-xs text-red-600">{msg.text}</p>}
    </div>
  );
}
