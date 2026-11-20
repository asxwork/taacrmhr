"use client";

import { useEffect, type RefObject } from "react";

/**
 * Makes a box exactly fill the rest of the window below where it starts (minus `gap` for whatever sits under it),
 * so its content scrolls inside it and the page itself doesn't need scrolling. Not on short screens (min 320px).
 */
export function useFitHeight(ref: RefObject<HTMLElement | null>, gap = 16, deps: unknown[] = [], mode: "max" | "fixed" = "max") {
  useEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      if (window.innerWidth < 640) { el.style.maxHeight = ""; el.style.height = ""; return; }
      const top = el.getBoundingClientRect().top + window.scrollY;
      const h = Math.max(320, window.innerHeight - top - gap);
      if (mode === "fixed") el.style.height = `${h}px`; else el.style.maxHeight = `${h}px`;
    };
    fit();
    const t = setTimeout(fit, 300); // after fonts / banners settle
    window.addEventListener("resize", fit);
    return () => { clearTimeout(t); window.removeEventListener("resize", fit); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
