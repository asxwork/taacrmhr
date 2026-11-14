"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X } from "lucide-react";
import { DrawerPortal } from "@/components/drawer-portal";

/** Front camera in a small window: take the selfie, retake, or (when optional) skip. Returns a JPEG file. */
export function SelfieCamera({ required, onDone, onCancel }: { required: boolean; onDone: (file: File | null) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [shot, setShot] = useState<{ url: string; file: File } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let s: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 } }, audio: false })
      .then((m) => { s = m; setStream(m); if (video.current) { video.current.srcObject = m; void video.current.play(); } })
      .catch(() => setFailed(true));
    return () => s?.getTracks().forEach((t) => t.stop());
  }, []);
  const take = () => {
    const v = video.current; if (!v) return;
    const c = document.createElement("canvas"); const w = 480; c.width = w; c.height = Math.round((v.videoHeight / v.videoWidth) * w) || 360;
    const ctx = c.getContext("2d")!; ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(v, 0, 0, w, c.height);
    c.toBlob((b) => { if (b) setShot({ url: URL.createObjectURL(b), file: new File([b], "selfie.jpg", { type: "image/jpeg" }) }); }, "image/jpeg", 0.8);
  };
  const stop = () => stream?.getTracks().forEach((t) => t.stop());
  return (
    <DrawerPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/70 p-4" role="dialog" aria-modal="true" aria-label="Take a selfie">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-semibold">Selfie for check-in</h2><button type="button" onClick={() => { stop(); onCancel(); }} aria-label="Close" className="rounded p-1 text-muted hover:bg-canvas"><X className="size-4" /></button></div>
        <div className="relative aspect-[3/4] bg-navy-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {shot ? <img src={shot.url} alt="Your selfie" className="size-full object-cover" />
            : failed ? <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white/80"><Camera className="size-8" />Camera not available. Use your phone&apos;s camera instead:
              <label className="cursor-pointer rounded-lg bg-gold-400 px-3 py-2 font-medium text-navy-950">Open camera<input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setShot({ url: URL.createObjectURL(f), file: f }); }} /></label></div>
            : <video ref={video} playsInline muted className="size-full -scale-x-100 object-cover" />}
        </div>
        <div className="flex gap-2 p-4">
          {shot ? <>
            <button type="button" onClick={() => setShot(null)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-2.5 text-sm"><RefreshCw className="size-4" /> Retake</button>
            <button type="button" onClick={() => { stop(); onDone(shot.file); }} className="flex-1 rounded-lg bg-navy-900 py-2.5 text-sm font-semibold text-white">Use this & check in</button>
          </> : <>
            {!required && <button type="button" onClick={() => { stop(); onDone(null); }} className="flex-1 rounded-lg border border-line py-2.5 text-sm text-muted">Skip</button>}
            {!failed && <button type="button" onClick={take} disabled={!stream} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-navy-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Camera className="size-4" /> Take selfie</button>}
          </>}
        </div>
      </div>
    </div>
    </DrawerPortal>
  );
}
