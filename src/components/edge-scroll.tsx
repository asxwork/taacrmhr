"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bitrix-style sideways navigation for a horizontally scrolling box: nothing shows until the mouse comes near the
 * left or right edge (and there is more to see that way); then a half-circle appears there, and simply hovering on
 * it slides the box (faster the closer to the edge), stopping when the mouse leaves. Place inside a `relative`
 * wrapper around the scrolling box. Mouse only (phones swipe).
 */
export function EdgeScroll({ target }: { target: RefObject<HTMLElement | null> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [can, setCan] = useState({ left: false, right: false });
  const [near, setNear] = useState<"left" | "right" | null>(null);
  const speed = useRef(0);
  const frame = useRef<number | null>(null);

  const measure = useCallback(() => {
    const el = target.current;
    if (el) setCan({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, [target]);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    // Show a side when the mouse is within 90px of it, over the box.
    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) return setNear(null);
      setNear(e.clientX - r.left < 90 ? "left" : r.right - e.clientX < 90 ? "right" : null);
    };
    const leave = () => setNear(null);
    // Watch the wrapper (box + half-circles): the half-circle sits above the box, so the box alone would think
    // the mouse left as soon as it appeared, hiding it again.
    const area = wrap.current?.parentElement ?? el;
    area.addEventListener("mousemove", move);
    area.addEventListener("mouseleave", leave);
    return () => { ro.disconnect(); el.removeEventListener("scroll", measure); area.removeEventListener("mousemove", move); area.removeEventListener("mouseleave", leave); };
  }, [target, measure]);

  const stop = () => { speed.current = 0; if (frame.current) cancelAnimationFrame(frame.current); frame.current = null; };
  const run = () => {
    const el = target.current;
    if (!el || !speed.current) return stop();
    el.scrollLeft += speed.current;
    frame.current = requestAnimationFrame(run);
  };
  // Hovering the half-circle: slide; the nearer the mouse is to the edge, the faster.
  const hover = (dir: 1 | -1) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const depth = dir === 1 ? (e.clientX - r.left) / r.width : (r.right - e.clientX) / r.width;
    speed.current = dir * (6 + Math.round(depth * 16));
    if (!frame.current) frame.current = requestAnimationFrame(run);
  };
  useEffect(() => stop, []);

  const side = (dir: "left" | "right") => {
    const show = can[dir] && near === dir;
    return (
      <button type="button" tabIndex={-1} aria-hidden
        onMouseMove={hover(dir === "right" ? 1 : -1)} onMouseLeave={stop} onClick={() => target.current?.scrollBy({ left: (dir === "right" ? 1 : -1) * 320, behavior: "smooth" })}
        className={cn("pointer-events-auto absolute top-1/2 z-20 hidden h-28 w-14 -translate-y-1/2 items-center bg-black/25 text-white backdrop-blur-[2px] transition-opacity duration-150 sm:flex",
          dir === "left" ? "left-0 justify-start rounded-r-full pl-2" : "right-0 justify-end rounded-l-full pr-2",
          show ? "opacity-100" : "pointer-events-none opacity-0")}>
        {dir === "left" ? <ChevronLeft className="size-7" /> : <ChevronRight className="size-7" />}
      </button>
    );
  };
  return <div ref={wrap} className="pointer-events-none absolute inset-0 z-20">{side("left")}{side("right")}</div>;
}
