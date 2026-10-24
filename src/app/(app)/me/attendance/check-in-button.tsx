"use client";

import { useActionState, useRef, useState } from "react";
import { LogIn, LogOut, MapPin } from "lucide-react";
import type { FormState } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { punchNow } from "./actions";

/** Big check-in/out button. Asks the browser for location first (needed for the office geo-fence). */
export function CheckInButton({ checkedIn, needsLocation }: { checkedIn: boolean; needsLocation: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(punchNow, undefined);
  const [locating, setLocating] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  function start() {
    const f = form.current!;
    if (!needsLocation || !("geolocation" in navigator)) return f.requestSubmit();
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        (f.elements.namedItem("lat") as HTMLInputElement).value = String(pos.coords.latitude);
        (f.elements.namedItem("lng") as HTMLInputElement).value = String(pos.coords.longitude);
        (f.elements.namedItem("accuracy") as HTMLInputElement).value = String(Math.round(pos.coords.accuracy));
        setLocating(false);
        f.requestSubmit();
      },
      () => {
        setLocating(false);
        f.requestSubmit(); // the server decides whether a missing location is allowed
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }

  const busy = pending || locating;
  const Icon = checkedIn ? LogOut : LogIn;
  return (
    <form ref={form} action={action} className="space-y-3">
      <input type="hidden" name="lat" />
      <input type="hidden" name="lng" />
      <input type="hidden" name="accuracy" />
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className={cn(
          "flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-white shadow-sm transition-colors disabled:opacity-60",
          checkedIn ? "bg-gold-700 hover:bg-gold-600" : "bg-navy-900 hover:bg-navy-800",
        )}
      >
        <Icon className="size-5" aria-hidden />
        {locating ? "Getting your location…" : pending ? "Saving…" : checkedIn ? "Check out" : "Check in"}
      </button>
      {needsLocation && (
        <p className="flex items-center justify-center gap-1 text-xs text-muted"><MapPin className="size-3.5" aria-hidden /> Your location is checked against the office.</p>
      )}
      {state?.error && <p role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p role="status" className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message}</p>}
    </form>
  );
}
