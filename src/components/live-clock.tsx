"use client";

import { useEffect, useState } from "react";

/** Analogue clock face with the digital time inside (HR dashboard "Clock" widget), in the company time zone. */
export function LiveClock({ timeZone }: { timeZone: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const parts = now ? Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", minute: "numeric", second: "numeric", hour12: false }).formatToParts(now).map((p) => [p.type, p.value])) : null;
  const sec = Number(parts?.second ?? 0);
  return (
    <div className="flex flex-col items-center">
      <div className="relative size-44">
        <svg viewBox="0 0 200 200" className="absolute inset-0">
          {Array.from({ length: 60 }, (_, i) => {
            const a = (i * 6 * Math.PI) / 180;
            const long = i % 5 === 0;
            const lit = now && i <= sec;
            return <line key={i} x1={r2(100 + Math.sin(a) * (long ? 82 : 86))} y1={r2(100 - Math.cos(a) * (long ? 82 : 86))} x2={r2(100 + Math.sin(a) * 94)} y2={r2(100 - Math.cos(a) * 94)}
              strokeWidth={long ? 3 : 1.5} strokeLinecap="round" className={lit ? "stroke-gold-400" : "stroke-line"} />;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted">{now ? now.toLocaleDateString("en-GB", { timeZone, weekday: "long" }) : " "}</span>
          <span className="font-display text-2xl font-semibold tabular-nums">
            {now ? now.toLocaleTimeString("en-US", { timeZone, hour: "2-digit", minute: "2-digit" }) : "--:--"}
            <span className="ml-0.5 text-sm text-gold-600">{parts ? String(sec).padStart(2, "0") : ""}</span>
          </span>
          <span className="text-xs text-muted">{now ? now.toLocaleDateString("en-US", { timeZone, month: "long", day: "numeric", year: "numeric" }) : ""}</span>
          <span className="mt-0.5 text-[10px] text-muted">{timeZone}</span>
        </div>
      </div>
    </div>
  );
}

/** Server and browser can differ in the last digits of sin/cos; rounding keeps the SVG identical (no hydration mismatch). */
const r2 = (n: number) => Math.round(n * 100) / 100;
