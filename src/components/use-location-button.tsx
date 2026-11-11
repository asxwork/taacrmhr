"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";

/** Fills a pair of latitude / longitude inputs (by name) with this device's current position. */
export function UseLocationButton({ latName, lngName }: { latName: string; lngName: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const go = () => {
    if (!navigator.geolocation) return setMsg("This browser can't share location.");
    setMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const set = (n: string, v: number) => { const el = document.querySelector<HTMLInputElement>(`input[name="${n}"]`); if (el) el.value = v.toFixed(6); };
        set(latName, p.coords.latitude); set(lngName, p.coords.longitude);
        setMsg(`Set (accurate to ~${Math.round(p.coords.accuracy)} m). Press Save.`);
      },
      () => setMsg("Location blocked — allow it for this site and try again."),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };
  return (
    <span className="flex flex-col gap-1">
      <button type="button" onClick={go} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-canvas"><MapPin className="size-4" /> Use my location</button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}
