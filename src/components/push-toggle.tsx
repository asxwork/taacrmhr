"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";

const b64 = (s: string) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

/** "Phone notifications" switch: registers the service worker and subscribes this device to Web Push. */
export function PushToggle() {
  const [state, setState] = useState<"loading" | "unsupported" | "off" | "on" | "blocked">("loading");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    navigator.serviceWorker.register("/sw.js").then((r) => r.pushManager.getSubscription()).then((s) => setState(s ? "on" : "off")).catch(() => setState("unsupported"));
  }, []);
  const turnOn = async () => {
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      if ((await Notification.requestPermission()) !== "granted") return setState("blocked");
      const res = await fetch("/api/push/subscribe");
      if (!res.ok) return setMsg(await res.text());
      const { publicKey } = await res.json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) });
      await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub) });
      setState("on");
    } catch { setMsg("Couldn't turn on notifications on this device."); }
  };
  const turnOff = async () => {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
    setState("off");
  };
  if (state === "loading" || state === "unsupported") return state === "unsupported" ? <p className="text-xs text-muted">This browser can&apos;t show push notifications. On iPhone, add AMS to the Home Screen first.</p> : null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
      <BellRing className="size-4 text-navy-900" />
      <span className="flex-1">{state === "on" ? "Phone notifications are on for this device." : state === "blocked" ? "Notifications are blocked for AMS in this browser's settings." : "Get notifications on this phone or computer even when AMS is closed."}</span>
      {state === "off" && <button type="button" onClick={turnOn} className="rounded-lg bg-navy-900 px-3 py-1.5 font-medium text-white hover:bg-navy-800">Turn on</button>}
      {state === "on" && <button type="button" onClick={turnOff} className="rounded-lg border border-line px-3 py-1.5 hover:bg-canvas">Turn off</button>}
      {msg && <span className="w-full text-xs text-red-600">{msg}</span>}
    </div>
  );
}
