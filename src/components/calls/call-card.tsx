"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Hash, MessageCircle, Phone, PhoneCall, Timer } from "lucide-react";
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
export function CallCard({ target, outcomes, action, waText, mode = "system", details = [], dialPrefix }: {
  target: { id: string; name: string | null; phone: string; status: string; attempts: number };
  outcomes: Opt[]; action: (s: FormState, fd: FormData) => Promise<FormState>; waText: string;
  /** system: Call button (softphone or phone link). landline: the number shown big to dial by hand. */
  mode?: "system" | "landline";
  /** The client's details from the uploaded sheet (project, unit, nationality…). */
  details?: [string, string][];
  /** Campaign's dial prefix (e.g. "27" for a 3CX route): dialled before the number's digits, without + or 00. */
  dialPrefix?: string | null;
}) {
  const dialNum = dialPrefix ? `${dialPrefix}${target.phone.replace(/\D/g, "").replace(/^00/, "")}` : target.phone;
  const box = useRef<HTMLDivElement>(null);
  const telLink = useRef<HTMLAnchorElement>(null);
  // Auto-dial: after "Save & next number" the next number is called straight away (Click to call mode). On by default;
  // the tick under the button turns it off (remembered on this device).
  const [autoDial, setAutoDial] = useState(true);
  useEffect(() => { try { setAutoDial(localStorage.getItem("ams:autodial") !== "off"); } catch {} }, []);
  const dialled = useRef(false);
  const [copied, setCopied] = useState(false);
  // Speed keys: 1–9 pick "What happened?", Ctrl+Enter saves and loads the next number.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const form = { current: box.current?.querySelector("form") ?? null };
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); form.current?.requestSubmit(); return; }
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT" || e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= outcomes.length) { const r = form.current?.querySelector<HTMLInputElement>(`input[name=outcome][value="${outcomes[n - 1]!.value}"]`); if (r) { r.click(); } }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [outcomes]);
  const [startedAt, setStartedAt] = useState(0);
  const [picked, setPicked] = useState("");
  const phone = useSoftphone();
  const viaPbx = phone?.status === "ready";
  const live = phone?.call?.targetId === target.id ? phone.call : null;
  // The finished softphone call for this number: its real talk time and Call-ID go with the outcome.
  const [ended, setEnded] = useState<{ callId: string; talkSec: number } | null>(null);
  const done = phone?.lastEnded;
  useEffect(() => { if (done?.targetId === target.id) setEnded({ callId: done.callId, talkSec: done.talkSec }); }, [done, target.id]);
  useEffect(() => {
    if (mode !== "system" || dialled.current) return;
    let due = false;
    try { due = Date.now() - Number(sessionStorage.getItem("ams:dial-next") || 0) < 20_000; } catch {}
    if (!due) return;
    // Through the softphone once it's ready; without one, the phone link (opens 3CX / the phone app).
    if (phone && phone.status !== "ready") return;
    dialled.current = true;
    try { sessionStorage.removeItem("ams:dial-next"); } catch {}
    const t = setTimeout(() => {
      if (viaPbx) { setEnded(null); phone!.dial(dialNum, { targetId: target.id }); }
      else telLink.current?.click();
    }, 600);
    return () => clearTimeout(t);
  }, [mode, phone, viaPbx, dialNum, target.id]);
  const wa = `https://wa.me/${fmtPhone(target.phone).replace(/\D/g, "")}${waText ? `?text=${encodeURIComponent(waText)}` : ""}`;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className={mode === "landline" ? "w-full min-w-0" : "min-w-0 flex-1"}>
          <p className="truncate text-2xl font-semibold">{target.name || "Unknown name"}</p>
          <p className="text-xs text-muted">{target.status === "callback" ? "Callback due" : target.attempts ? `Attempt ${target.attempts + 1}` : "First call"}</p>
        </div>
        {mode === "landline" ? (
          // Landline: the number big and easy to read while dialling by hand; Start timer measures the call.
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border-2 border-navy-900/15 bg-canvas px-5 py-2.5 text-center">
              <p className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted"><Hash className="size-3" /> Dial on your landline</p>
              <p className="select-all font-mono text-[28px] font-bold leading-tight tracking-wide tabular-nums">{fmtPhone(target.phone)}</p>
              {dialPrefix && <p className="text-xs text-muted">with prefix: <span className="select-all font-mono">{dialNum}</span></p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <button type="button" onClick={() => { void navigator.clipboard.writeText(target.phone.replace(/\s/g, "")); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-canvas"><Copy className="size-4" /> {copied ? "Copied" : "Copy"}</button>
              <button type="button" onClick={() => setStartedAt(Date.now())} className={cn("flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium", startedAt ? "bg-emerald-600 text-white" : "border border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10")}><Timer className="size-4" /> {startedAt ? "Timing…" : "Start timer"}</button>
            </div>
            {/* Optional: Call (phone link, never automatic in landline mode) and WhatsApp. */}
            <div className="flex flex-col gap-1.5">
              <a href={dialPrefix ? `tel:${dialNum}` : telHref(target.phone)} onClick={() => setStartedAt((t) => t || Date.now())} className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700"><Phone className="size-4" /> Call</a>
              <a href={wa} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/50 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-500/10"><MessageCircle className="size-4" /> WhatsApp</a>
            </div>
          </div>
        ) : (<>
        {/* The call button with the number right under it (tap or copy it on any phone). */}
        <div className="flex flex-col items-center gap-1">
          {live ? (
            <button type="button" onClick={phone!.hangup} className="flex h-14 items-center gap-2 rounded-xl bg-red-600 px-6 text-lg font-semibold text-white shadow hover:bg-red-700">
              <PhoneCall className="size-5 animate-pulse" /> {live.state === "talking" ? "Hang up" : "Cancel"}
            </button>
          ) : viaPbx ? (
            <button type="button" disabled={!!phone.call} onClick={() => { setEnded(null); phone.dial(dialNum, { targetId: target.id }); }}
              className="flex h-14 items-center gap-2 rounded-xl bg-emerald-600 px-6 text-lg font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-50">
              <Phone className="size-5" /> {ended ? "Call again" : "Call"}
            </button>
          ) : (
            <a ref={telLink} href={dialPrefix ? `tel:${dialNum}` : telHref(target.phone)} onClick={() => setStartedAt(Date.now())}
              className={cn("flex h-14 items-center gap-2 rounded-xl px-6 text-lg font-semibold text-white shadow transition", startedAt ? "bg-emerald-700" : "bg-emerald-600 hover:bg-emerald-700")}>
              {startedAt ? <PhoneCall className="size-5 animate-pulse" /> : <Phone className="size-5" />} {startedAt ? "Calling…" : "Call"}
            </a>
          )}
          <a href={dialPrefix ? `tel:${dialNum}` : telHref(target.phone)} className="select-all font-mono text-base font-semibold tabular-nums text-ink hover:underline">{fmtPhone(target.phone)}</a>
          {dialPrefix && <span className="text-[11px] text-muted" title="The campaign's dial prefix is added when calling">dials <span className="font-mono">{dialNum}</span></span>}
        </div>
        <a href={wa} target="_blank" rel="noreferrer" className="flex h-14 items-center gap-2 rounded-xl border border-emerald-500/50 px-5 font-semibold text-emerald-700 hover:bg-emerald-500/10">
          <MessageCircle className="size-5" /> WhatsApp
        </a>
        </>)}
      </div>
      {details.length > 0 && (
        // Everything the sheet says about this person (project and unit bought, nationality…), before the call.
        <dl className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-line bg-canvas/60 p-3 sm:grid-cols-3">
          {details.map(([k, v]) => (
            <div key={k} className="min-w-0 rounded-lg bg-surface px-3 py-2 ring-1 ring-line">
              <dt className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted">{k}</dt>
              <dd className="break-words text-sm font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div ref={box} onSubmitCapture={() => { if (mode === "system" && autoDial) { try { sessionStorage.setItem("ams:dial-next", String(Date.now())); } catch {} } }}>
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
                <span className={cn("relative flex h-11 items-center justify-center rounded-lg border px-2 text-center text-sm font-medium transition hover:bg-canvas", TONES[o.tone])}>{o.label}{outcomes.indexOf(o) < 9 && <kbd className="absolute right-1.5 top-1 text-[9px] font-normal opacity-50">{outcomes.indexOf(o) + 1}</kbd>}</span>
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
        <textarea name="notes" rows={2} className="input" placeholder="Remarks (what they said, budget, area…)" aria-label="Remarks" />
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton className="h-11 w-full sm:w-auto sm:px-8">Save &amp; next number</SubmitButton>
          {mode === "system" && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={autoDial} onChange={(e) => { setAutoDial(e.target.checked); try { localStorage.setItem("ams:autodial", e.target.checked ? "on" : "off"); } catch {} }} className="accent-navy-900" />
              Call the next number automatically
            </label>
          )}
          <span className="hidden text-xs text-muted sm:inline">Keys: 1–{Math.min(9, outcomes.length)} pick the result · Ctrl + Enter saves</span>
        </div>
      </ActionForm>
      </div>
    </div>
  );
}
