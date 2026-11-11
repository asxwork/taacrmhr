"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Sends a "slow" entry to the error log; never throws. */
export function reportSlow(message: string, path: string) {
  try {
    void fetch("/api/errors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, path }), keepalive: true }).catch(() => {});
  } catch { /* ignore */ }
}

/**
 * Thin bar at the top that starts the instant a link is clicked and finishes when the new page arrives,
 * so a slow server never looks like a dead button.
 */
export function NavProgress() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef<{ at: number; to: string } | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page (e.g. #anchor)
      setState("loading");
      started.current = { at: Date.now(), to: url.pathname };
      if (safety.current) clearTimeout(safety.current);
      safety.current = setTimeout(() => setState("idle"), 15000);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    // Slow page on the live site: record it (Settings → System health → Error log) so we can see where.
    if (started.current) {
      const ms = Date.now() - started.current.at;
      if (ms > 4000) reportSlow(`Slow page: ${started.current.to} took ${(ms / 1000).toFixed(1)}s`, started.current.to);
      started.current = null;
    }
    setState((s) => (s === "loading" ? "done" : s));
    const t = setTimeout(() => setState((s) => (s === "done" ? "idle" : s)), 300);
    return () => clearTimeout(t);
  }, [pathname, params]);

  if (state === "idle") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5" aria-hidden>
      <div className={state === "loading" ? "nav-progress-run h-full bg-gold-400" : "nav-progress-done h-full bg-gold-400"} />
    </div>
  );
}
