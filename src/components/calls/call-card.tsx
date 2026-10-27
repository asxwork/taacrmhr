"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Phone, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPhone, telHref } from "@/lib/crm-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import type { FormState } from "@/lib/utils";
import { useSoftphone } from "./softphone";

type Opt = { value: string; label: string; tone: string };
const TONES: Record<string, string> = {
  green: "peer-checked:bg-emerald-600 peer-checked:text-white border-emerald-500/40", blue: "peer-checked:bg-sky-600 peer-checked:text-white border-sky-500/40",
  slate: "peer-checked:bg-slate-600 peer-checked:text-white border-slate-400/40", amber: "peer-checked:bg-amber-500 peer-checked:text-white border-amber-500/40",
  red: "peer-checked:bg-red-600 peer-checked:text-white border-red-500/40", violet: "peer-checked:bg-violet-600 peer-checked:text-white border-violet-500/40",
  teal: "peer-checked:bg-teal-600 peer-checked:text-white border-teal-500/40",
};

/**
 * The number on screen: call it (through the softphone when the agent's extension is registered, otherwise a
 * phone link that starts a timer), message it on WhatsApp with the campaign's text, then pick what happened.
 * Saving loads the next number.
 */
export function CallCard({ target, outcomes, action, waText }: {
  target: { id: string; name: string | null; phone: string; status: string; attempts: number };
  outcomes: Opt[]; action: (s: FormState, fd: FormData) => Promise<FormState>; waText: string;
}) {
  const [startedAt, setStartedAt] = useState(0);
  const [picked, setPicked] = useState("");
  const phone = useSoftphone();
  const viaPbx = phone?.status === "ready";
  const live = phone?.call?.targetId === target.id ? phone.call : null;
  // The finished softphone call for this number: its real talk time and Call-ID go with the outcome.
  const [ended, setEnded] = useState<{ callId: string; talkSec: number } | null>(null);
  const done = phone?.lastEnded;
  useEffect(() => { if (done?.targetId === target.id) setEnded({ callId: done.callId, talkSec: done.talkSec }); }, [done, target.id]);
  const wa = `https://wa.me/${fmtPhone(target.phone).replace(/\D/g, "")}${waText ? `?text=${encodeURIComponent(waText)}` : ""}`;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-2xl font-semibold">{target.name || "Unknown name"}</p>
          <p className="font-mono text-lg tabular-nums text-muted">{fmtPhone(target.phone)}</p>
          <p className="text-xs text-muted">{target.status === "callback" ? "Callback due" : target.attempts ? `Attempt ${target.attempts + 1}` : "First call"}</p>
        </div>
        {live ? (
          <button type="button" onClick={phone!.hangup} className="flex h-14 items-center gap-2 rounded-xl bg-red-600 px-6 text-lg font-semibold text-white shadow hover:bg-red-700">
            <PhoneCall className="size-5 animate-pulse" /> {live.state === "talking" ? "Hang up" : "Cancel"}
          </button>
        ) : viaPbx ? (
          <button type="button" disabled={!!phone.call} onClick={() => { setEnded(null); phone.dial(target.phone, { targetId: target.id }); }}
            className="flex h-14 items-center gap-2 rounded-xl bg-emerald-600 px-6 text-lg font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-50">
            <Phone className="size-5" /> {ended ? "Call again" : "Call"}
          </button>
        ) : (
          <a href={telHref(target.phone)} onClick={() => setStartedAt(Date.now())}
            className={cn("flex h-14 items-center gap-2 rounded-xl px-6 text-lg font-semibold text-white shadow transition", startedAt ? "bg-emerald-700" : "bg-emerald-600 hover:bg-emerald-700")}>
            {startedAt ? <PhoneCall className="size-5 animate-pulse" /> : <Phone className="size-5" />} {startedAt ? "Calling…" : "Call"}
          </a>
        )}
        <a href={wa} target="_blank" rel="noreferrer" className="flex h-14 items-center gap-2 rounded-xl border border-emerald-500/50 px-5 font-semibold text-emerald-700 hover:bg-emerald-500/10">
          <MessageCircle className="size-5" /> WhatsApp
        </a>
      </div>
      <ActionForm key={target.id} action={action} className="space-y-4">
        <input type="hidden" name="targetId" value={target.id} />
        <input type="hidden" name="startedAt" value={startedAt || ""} />
        <input type="hidden" name="talkSec" value={ended ? ended.talkSec : ""} />
        <input type="hidden" name="callId" value={ended?.callId ?? ""} />
        {ended && <p className="text-xs text-muted">Call ended · talk time {Math.floor(ended.talkSec / 60)}:{String(ended.talkSec % 60).padStart(2, "0")}</p>}
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-medium">What happened?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {outcomes.map((o) => (
              <label key={o.value} className="cursor-pointer">
                <input type="radio" name="outcome" value={o.value} required className="peer sr-only" onChange={() => setPicked(o.value)} />
                <span className={cn("flex h-11 items-center justify-center rounded-lg border px-2 text-center text-sm font-medium transition hover:bg-canvas", TONES[o.tone])}>{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {picked === "callback" && (
          <label className="block text-sm font-medium">Call back at
            <input type="datetime-local" name="callbackAt" required className="input mt-1 w-64" />
          </label>
        )}
        {picked === "interested" && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="toCrm" defaultChecked /> Send to the CRM as a lead (the sales team gets it by rotation)</label>
        )}
        <textarea name="notes" rows={2} className="input" placeholder="Notes (what they said, budget, area…)" aria-label="Notes" />
        <SubmitButton className="h-11 w-full sm:w-auto sm:px-8">Save &amp; next number</SubmitButton>
      </ActionForm>
    </div>
  );
}
