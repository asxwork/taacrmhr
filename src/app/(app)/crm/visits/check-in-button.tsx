"use client";

import { useState, useTransition } from "react";
import { MapPin } from "lucide-react";
import { checkInVisit } from "./actions";

/** Reads the phone's GPS and checks the agent in to a site visit. */
export function CheckInButton({ id }: { id: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () => {
    if (!navigator.geolocation) return setMsg("This browser can't share location.");
    setMsg("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (p) => start(async () => { const r = await checkInVisit(id, p.coords.latitude, p.coords.longitude, p.coords.accuracy ?? null); setMsg(r?.error ?? null); }),
      () => setMsg("Location blocked — allow location for this site and try again."),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={go} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60">
        <MapPin className="size-4" /> {pending ? "Saving…" : "Check in here"}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}
