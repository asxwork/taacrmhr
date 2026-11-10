"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Group = { key: string; modules: { key: string; label: string }[] };

/**
 * The section list beside the access grid: as tall as the grid, scrolls on its own, highlights the section that is
 * in view, and a click scrolls the grid (not the page) to that section and opens it.
 */
export function SectionNav({ groups }: { groups: Group[] }) {
  const [active, setActive] = useState<string | null>(groups[0]?.modules[0]?.key ?? null);
  const pinnedUntil = useRef(0); // after a click, keep that item highlighted while the grid glides there
  useEffect(() => {
    const box = document.getElementById("perm-scroll");
    if (!box) return;
    const keys = groups.flatMap((g) => g.modules.map((m) => m.key));
    const onScroll = () => {
      if (Date.now() < pinnedUntil.current) return;
      const top = box.getBoundingClientRect().top + 96; // below the sticky role header
      let current = keys[0] ?? null;
      for (const k of keys) {
        const el = document.getElementById(`m-${k}`);
        if (el && el.getBoundingClientRect().top <= top) current = k;
      }
      setActive(current);
    };
    onScroll();
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => box.removeEventListener("scroll", onScroll);
  }, [groups]);
  // Keep the highlighted item visible in the list itself.
  useEffect(() => {
    document.querySelector(`[data-nav="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (key: string) => {
    history.replaceState(null, "", `#m-${key}`);
    window.dispatchEvent(new HashChangeEvent("hashchange")); // opens the section
    setActive(key);
    pinnedUntil.current = Date.now() + 900;
    // Scroll only the grid (never the page), leaving room for the sticky role header.
    requestAnimationFrame(() => {
      const box = document.getElementById("perm-scroll");
      const el = document.getElementById(`m-${key}`);
      if (!box || !el) return;
      const head = box.querySelector("thead")?.getBoundingClientRect().height ?? 0;
      box.scrollTo({ top: el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - head, behavior: "smooth" });
    });
  };

  return (
    <nav aria-label="Sections" className="hidden overflow-y-auto overscroll-contain pr-1 xl:sticky xl:top-4 xl:block xl:h-[calc(100vh-11.5rem)] xl:min-h-[27rem]">
      {groups.map((g) => (
        <div key={g.key} className="mb-4">
          <p className="mb-1 inline-flex rounded-full bg-navy-900 px-3 py-1 text-xs font-semibold text-white">{g.key}</p>
          <ul>
            {g.modules.map((m) => (
              <li key={m.key}>
                <button type="button" data-nav={m.key} onClick={() => go(m.key)}
                  className={cn("relative block w-full truncate rounded-md px-3 py-1.5 text-left text-sm transition-colors duration-200",
                    active === m.key ? "bg-navy-900/[0.06] font-medium text-navy-900" : "text-ink/75 hover:bg-canvas hover:text-ink")}>
                  <span className={cn("absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gold-600 transition-opacity duration-200", active === m.key ? "opacity-100" : "opacity-0")} />
                  {m.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
