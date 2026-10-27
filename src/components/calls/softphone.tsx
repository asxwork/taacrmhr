"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, Delete, Grid3x3, Mic, MicOff, Pause, Phone, PhoneIncoming, PhoneOff, Play, Voicemail, X } from "lucide-react";
import type { RTCSession } from "jssip/lib/RTCSession";
import type { UA } from "jssip/lib/UA";
import { cn } from "@/lib/utils";

// Browser softphone: registers the agent's own Issabel extension over WebRTC and handles outbound and inbound
// calls, hold, mute, transfer, keypad tones, voicemail and supervisor listen/whisper/barge feature codes.
// Each answered call is recorded (both sides mixed) and uploaded to the Super Admin vault.

type Config = {
  ok: true; wss: string; domain: string; extension: string; password: string; name: string; ice: RTCIceServer[];
  dialPrefix: string; voicemail: string; record: boolean; spy: { listen: string; whisper: string; barge: string };
};
type Status = "off" | "connecting" | "ready" | "failed";
export type CallInfo = { id: string; direction: "in" | "out"; peer: string; state: "ringing" | "talking" | "ended"; startedAt: number; answeredAt: number; muted: boolean; held: boolean; targetId?: string };
type Ended = { callId: string; talkSec: number; targetId?: string; answered: boolean };
type Pop = { name: string | null; campaign: string | null; lead: { id: string; status: string } | null; last: { outcome: string; at: string; notes: string | null } | null };

type Ctx = {
  status: Status; extension: string | null; call: CallInfo | null; lastEnded: Ended | null;
  dial: (number: string, opts?: { targetId?: string }) => boolean; hangup: () => void; spy: (kind: "listen" | "whisper" | "barge", ext: string) => boolean;
  spyCodes: Config["spy"] | null;
};
const SoftphoneContext = createContext<Ctx | null>(null);
/** The softphone if this user has an extension and it is registered, otherwise null (the dialer falls back to phone links). */
export const useSoftphone = () => useContext(SoftphoneContext);

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const presence = (state: string, peer?: string) => fetch("/api/calls/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state, peer }), keepalive: true }).catch(() => {});

export function SoftphoneProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [status, setStatus] = useState<Status>("off");
  const [call, setCall] = useState<CallInfo | null>(null);
  const [lastEnded, setLastEnded] = useState<Ended | null>(null);
  const [pop, setPop] = useState<Pop | null>(null);
  const [error, setError] = useState("");
  const ua = useRef<UA | null>(null);
  const session = useRef<RTCSession | null>(null);
  const callRef = useRef<CallInfo | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const ring = useRef<{ ctx: AudioContext; timer: ReturnType<typeof setInterval> } | null>(null);
  const recorder = useRef<{ rec: MediaRecorder; chunks: Blob[]; ctx: AudioContext } | null>(null);

  const update = useCallback((patch: Partial<CallInfo> | null) => {
    callRef.current = patch === null ? null : ({ ...callRef.current!, ...patch });
    setCall(callRef.current);
  }, []);

  // Load this agent's extension; no extension means no softphone (and no microphone prompt).
  useEffect(() => {
    let live = true;
    fetch("/api/calls/sip", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((c) => { if (live && c?.ok) setCfg(c); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const stopRing = useCallback(() => { if (ring.current) { clearInterval(ring.current.timer); ring.current.ctx.close().catch(() => {}); ring.current = null; } }, []);
  const startRing = useCallback(() => {
    stopRing();
    const ctx = new AudioContext();
    const beep = () => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 440; g.gain.value = 0.08; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.8);
    };
    beep();
    ring.current = { ctx, timer: setInterval(beep, 3000) };
  }, [stopRing]);

  // Mixes the microphone and the caller into one track and records it (only Super Admins can ever play it).
  const startRecording = useCallback((s: RTCSession) => {
    if (!cfg?.record || typeof MediaRecorder === "undefined") return;
    try {
      const pc = s.connection;
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      const local = new MediaStream(pc.getSenders().map((x) => x.track).filter((t): t is MediaStreamTrack => !!t && t.kind === "audio"));
      const remote = new MediaStream(pc.getReceivers().map((x) => x.track).filter((t) => t.kind === "audio"));
      if (local.getTracks().length) ctx.createMediaStreamSource(local).connect(dest);
      if (remote.getTracks().length) ctx.createMediaStreamSource(remote).connect(dest);
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(dest.stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 16_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.start(10_000);
      recorder.current = { rec, chunks, ctx };
    } catch {
      recorder.current = null;
    }
  }, [cfg?.record]);

  const finishRecording = useCallback((info: CallInfo, talkSec: number) => {
    const r = recorder.current;
    recorder.current = null;
    if (!r) return;
    r.rec.onstop = () => {
      r.ctx.close().catch(() => {});
      if (!r.chunks.length || talkSec < 1) return;
      const fd = new FormData();
      fd.set("file", new Blob(r.chunks, { type: r.rec.mimeType || "audio/webm" }), "call");
      fd.set("phone", info.peer); fd.set("direction", info.direction); fd.set("callId", info.id);
      fd.set("talkSec", String(talkSec)); fd.set("startedAt", String(info.answeredAt || info.startedAt));
      fetch("/api/calls/recordings", { method: "POST", body: fd, keepalive: false }).catch(() => {});
    };
    try { r.rec.stop(); } catch {}
  }, []);

  const wire = useCallback((s: RTCSession, info: CallInfo) => {
    session.current = s;
    update(info);
    presence(info.direction === "in" ? "ringing" : "talking", info.peer);
    const attach = () => {
      const remote = new MediaStream(s.connection.getReceivers().map((r) => r.track).filter((t) => t.kind === "audio"));
      if (audio.current) { audio.current.srcObject = remote; audio.current.play().catch(() => {}); }
    };
    s.on("peerconnection", (e: { peerconnection: RTCPeerConnection }) => e.peerconnection.addEventListener("track", attach));
    if (s.connection) s.connection.addEventListener("track", attach);
    s.on("confirmed", () => {
      stopRing();
      attach();
      update({ state: "talking", answeredAt: Date.now() });
      presence("talking", info.peer);
      startRecording(s);
    });
    const end = (cause?: string) => {
      stopRing();
      const c = callRef.current;
      session.current = null;
      if (!c) return;
      const answered = c.answeredAt > 0;
      const talkSec = answered ? Math.round((Date.now() - c.answeredAt) / 1000) : 0;
      finishRecording(c, talkSec);
      setLastEnded({ callId: c.id, talkSec, targetId: c.targetId, answered });
      fetch("/api/calls/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction: c.direction, phone: c.peer, talkSec, callId: c.id, answered, fromDialer: !!c.targetId, startedAt: c.startedAt }) }).catch(() => {});
      update(null);
      setPop(null);
      if (cause && !answered && c.direction === "out" && !["Canceled", "Terminated"].includes(cause)) setError(`Call not connected: ${cause}`);
      presence("ready");
    };
    s.on("ended", () => end());
    s.on("failed", (e: { cause?: string }) => end(e.cause));
  }, [finishRecording, startRecording, stopRing, update]);

  // Register with the PBX.
  useEffect(() => {
    if (!cfg) return;
    let stopped = false;
    let agent: UA | null = null;
    (async () => {
      const JsSIP = (await import("jssip")).default;
      if (stopped) return;
      setStatus("connecting");
      agent = new JsSIP.UA({
        sockets: [new JsSIP.WebSocketInterface(cfg.wss)], uri: `sip:${cfg.extension}@${cfg.domain}`, password: cfg.password,
        display_name: cfg.name, register: true, session_timers: false, user_agent: "AMS Softphone",
      });
      agent.on("registered", () => { setStatus("ready"); setError(""); presence("ready"); });
      agent.on("unregistered", () => setStatus("connecting"));
      agent.on("registrationFailed", (e: { cause?: string }) => { setStatus("failed"); setError(`Extension ${cfg.extension} could not register (${e.cause ?? "error"}).`); });
      agent.on("disconnected", () => setStatus((s) => (s === "failed" ? s : "connecting")));
      agent.on("newRTCSession", (e: { session: RTCSession; originator: string; request: { from: { uri: { user: string }; display_name?: string } } }) => {
        if (e.originator !== "remote") return;
        if (callRef.current) { e.session.terminate({ status_code: 486, reason_phrase: "Busy Here" }); return; }
        const peer = e.request.from.uri.user;
        setError("");
        wire(e.session, { id: e.session.id, direction: "in", peer, state: "ringing", startedAt: Date.now(), answeredAt: 0, muted: false, held: false });
        startRing();
        fetch(`/api/calls/lookup?phone=${encodeURIComponent(peer)}`).then((r) => r.json()).then((p) => p.ok && setPop(p)).catch(() => {});
        if (document.hidden && "Notification" in window && Notification.permission === "granted") new Notification("Incoming call", { body: e.request.from.display_name || peer });
      });
      ua.current = agent;
      agent.start();
    })();
    const beat = setInterval(() => presence(callRef.current ? (callRef.current.state === "talking" ? "talking" : "ringing") : "ready", callRef.current?.peer), 60_000);
    const bye = () => presence("offline");
    window.addEventListener("pagehide", bye);
    return () => {
      stopped = true;
      clearInterval(beat);
      window.removeEventListener("pagehide", bye);
      stopRing();
      agent?.stop();
      ua.current = null;
      presence("offline");
    };
  }, [cfg, wire, startRing, stopRing]);

  const dial = useCallback((number: string, opts?: { targetId?: string }) => {
    const a = ua.current;
    if (!a || !cfg || status !== "ready" || callRef.current) return false;
    const clean = number.replace(/[^\d+*#]/g, "");
    if (!clean) return false;
    // Outside numbers get the PBX's line prefix; extensions and feature codes are dialled as typed.
    const target = cfg.dialPrefix && clean.replace(/\D/g, "").length > 6 ? `${cfg.dialPrefix}${clean.replace(/^\+/, "00")}` : clean.replace(/^\+/, "00");
    setError("");
    try {
      const s = a.call(`sip:${target}@${cfg.domain}`, {
        mediaConstraints: { audio: true, video: false },
        pcConfig: { iceServers: cfg.ice },
        rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
      });
      wire(s, { id: s.id, direction: "out", peer: clean, state: "ringing", startedAt: Date.now(), answeredAt: 0, muted: false, held: false, targetId: opts?.targetId });
      return true;
    } catch (e) {
      setError(e instanceof Error && e.name === "NotAllowedError" ? "Allow the microphone to make calls." : "The call could not be started.");
      return false;
    }
  }, [cfg, status, wire]);

  const hangup = useCallback(() => { try { session.current?.terminate(); } catch {} }, []);
  const answer = () => {
    stopRing();
    session.current?.answer({ mediaConstraints: { audio: true, video: false }, pcConfig: { iceServers: cfg?.ice ?? [] } });
  };
  const toggleMute = () => {
    const s = session.current, c = callRef.current;
    if (!s || !c) return;
    if (c.muted) s.unmute({ audio: true }); else s.mute({ audio: true });
    update({ muted: !c.muted });
  };
  const toggleHold = () => {
    const s = session.current, c = callRef.current;
    if (!s || !c) return;
    if (c.held) s.unhold(); else s.hold();
    update({ held: !c.held });
  };
  const transfer = (to: string) => { if (to && cfg) session.current?.refer(`sip:${to.replace(/[^\d*#]/g, "")}@${cfg.domain}`); };
  const dtmf = (d: string) => { try { session.current?.sendDTMF(d); } catch {} };
  const spy = useCallback((kind: "listen" | "whisper" | "barge", ext: string) => {
    const code = cfg?.spy[kind];
    return code ? dial(`${code}${ext}`) : false;
  }, [cfg, dial]);

  const value: Ctx | null = cfg ? { status, extension: cfg.extension, call, lastEnded, dial, hangup, spy, spyCodes: cfg.spy } : null;
  return (
    <SoftphoneContext.Provider value={value}>
      {children}
      {/* The caller's voice; the element is never shown. */}
      <audio ref={audio} autoPlay className="hidden" />
      {cfg && (
        <PhonePanel status={status} extension={cfg.extension} call={call} pop={pop} error={error} voicemail={cfg.voicemail}
          onDial={dial} onHangup={hangup} onAnswer={answer} onMute={toggleMute} onHold={toggleHold} onTransfer={transfer} onDtmf={dtmf} onDismissError={() => setError("")} />
      )}
    </SoftphoneContext.Provider>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function PhonePanel(p: {
  status: Status; extension: string; call: CallInfo | null; pop: Pop | null; error: string; voicemail: string;
  onDial: (n: string) => boolean; onHangup: () => void; onAnswer: () => void; onMute: () => void; onHold: () => void;
  onTransfer: (to: string) => void; onDtmf: (d: string) => void; onDismissError: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [num, setNum] = useState("");
  const [keypad, setKeypad] = useState(false);
  const [xfer, setXfer] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const { call } = p;
  useEffect(() => {
    if (!call) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [call]);
  useEffect(() => { if (call) setOpen(true); else { setKeypad(false); setXfer(""); } }, [call]);
  const dot = { off: "bg-slate-400", connecting: "bg-amber-500 animate-pulse", ready: "bg-emerald-500", failed: "bg-red-500" }[p.status];
  const label = { off: "Offline", connecting: "Connecting…", ready: `Ready · ext ${p.extension}`, failed: "Not registered" }[p.status];
  const press = (k: string) => (call?.state === "talking" ? p.onDtmf(k) : setNum((n) => n + k));

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label="Open phone"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-navy-900 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-navy-800 print:hidden">
        <span className={cn("size-2.5 rounded-full", dot)} /><Phone className="size-4" /> Phone
      </button>
    );
  }
  return (
    <div className="fixed bottom-5 right-5 z-40 w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl print:hidden" role="dialog" aria-label="Phone">
      <div className="flex items-center gap-2 bg-navy-900 px-4 py-2.5 text-white">
        <span className={cn("size-2.5 rounded-full", dot)} />
        <span className="flex-1 truncate text-xs">{label}</span>
        {!call && <button type="button" onClick={() => setOpen(false)} aria-label="Minimise phone" className="rounded p-1 hover:bg-white/10"><X className="size-4" /></button>}
      </div>
      {p.error && <button type="button" onClick={p.onDismissError} className="block w-full bg-red-50 px-4 py-2 text-left text-xs text-red-700">{p.error}</button>}
      <div className="p-4">
        {call ? (
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-muted">{call.direction === "in" ? (call.state === "ringing" ? "Incoming call" : "Inbound") : call.state === "ringing" ? "Calling…" : "Outbound"}</p>
            <p className="mt-1 truncate text-lg font-semibold">{p.pop?.name ?? call.peer}</p>
            {p.pop?.name && <p className="font-mono text-sm text-muted">{call.peer}</p>}
            <p className="mt-1 font-mono text-2xl tabular-nums">{call.state === "talking" ? fmt(Math.max(0, Math.round((now - call.answeredAt) / 1000))) : "· · ·"}</p>
            {call.held && <p className="text-xs font-medium text-amber-600">On hold</p>}
            {p.pop && (p.pop.campaign || p.pop.lead || p.pop.last) && (
              <div className="mt-3 space-y-0.5 rounded-lg bg-canvas/70 px-3 py-2 text-left text-xs">
                {p.pop.campaign && <p><span className="text-muted">Campaign:</span> {p.pop.campaign}</p>}
                {p.pop.lead && <p><span className="text-muted">CRM lead:</span> <Link href={`/crm/leads/${p.pop.lead.id}`} className="font-medium text-sky-700 underline" target="_blank">{p.pop.lead.status}</Link></p>}
                {p.pop.last && <p><span className="text-muted">Last call:</span> {p.pop.last.outcome}{p.pop.last.notes ? ` · ${p.pop.last.notes.slice(0, 80)}` : ""}</p>}
              </div>
            )}
            {call.direction === "in" && call.state === "ringing" ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={p.onHangup} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-red-600 font-semibold text-white hover:bg-red-700"><PhoneOff className="size-5" /> Decline</button>
                <button type="button" onClick={p.onAnswer} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700"><PhoneIncoming className="size-5" /> Answer</button>
              </div>
            ) : (
              <>
                {call.state === "talking" && (
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    <PadButton onClick={p.onMute} active={call.muted} label={call.muted ? "Unmute" : "Mute"}>{call.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}</PadButton>
                    <PadButton onClick={p.onHold} active={call.held} label={call.held ? "Resume" : "Hold"}>{call.held ? <Play className="size-4" /> : <Pause className="size-4" />}</PadButton>
                    <PadButton onClick={() => setKeypad((k) => !k)} active={keypad} label="Keypad"><Grid3x3 className="size-4" /></PadButton>
                    <PadButton onClick={() => setXfer((x) => (x ? "" : " "))} active={!!xfer} label="Transfer"><ArrowRightLeft className="size-4" /></PadButton>
                  </div>
                )}
                {xfer && (
                  <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); p.onTransfer(xfer.trim()); setXfer(""); }}>
                    <input autoFocus value={xfer.trim()} onChange={(e) => setXfer(e.target.value || " ")} placeholder="Extension" className="input h-9 flex-1" aria-label="Transfer to extension" />
                    <button className="rounded-lg bg-sky-600 px-3 text-sm font-medium text-white">Transfer</button>
                  </form>
                )}
                {keypad && <Keypad onPress={press} />}
                <button type="button" onClick={p.onHangup} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 font-semibold text-white hover:bg-red-700"><PhoneOff className="size-5" /> Hang up</button>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); if (p.onDial(num)) setNum(""); }}>
            <div className="flex items-center gap-1">
              <input value={num} onChange={(e) => setNum(e.target.value)} inputMode="tel" placeholder="Number or extension" className="input h-11 flex-1 font-mono text-lg" aria-label="Number to call" />
              {num && <button type="button" onClick={() => setNum((n) => n.slice(0, -1))} aria-label="Delete digit" className="rounded p-2 text-muted hover:bg-canvas"><Delete className="size-4" /></button>}
            </div>
            <Keypad onPress={press} />
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <button disabled={p.status !== "ready" || !num} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Phone className="size-5" /> Call</button>
              {p.voicemail && <button type="button" disabled={p.status !== "ready"} onClick={() => p.onDial(p.voicemail)} title="Voicemail" aria-label="Voicemail" className="flex h-12 w-12 items-center justify-center rounded-xl border border-line hover:bg-canvas disabled:opacity-50"><Voicemail className="size-5" /></button>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Keypad({ onPress }: { onPress: (k: string) => void }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {KEYS.map((k) => <button key={k} type="button" onClick={() => onPress(k)} className="h-11 rounded-lg border border-line font-mono text-lg hover:bg-canvas">{k}</button>)}
    </div>
  );
}

function PadButton({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex flex-col items-center gap-1 rounded-lg border border-line py-2 text-[11px] hover:bg-canvas", active && "border-sky-500 bg-sky-50 text-sky-700")}>
      {children}{label}
    </button>
  );
}
