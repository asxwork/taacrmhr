"use client";

// Profile picture picker with crop: choose a photo, drag to move it, zoom and rotate inside a round frame, see how it
// looks at every size AMS shows it, then save. The cropped square (512px JPEG) replaces the file in the form.
import { useEffect, useRef, useState } from "react";
import { Camera, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react";

const BOX = 280; // crop frame in px
const OUT = 512; // saved picture in px

type View = { zoom: number; x: number; y: number };

/** The picture as placed in a frame of `size` px (the same view scaled down, for the previews). */
function Placed({ src, w, h, view, size }: { src: string; w: number; h: number; view: View; size: number }) {
  const k = size / BOX;
  const base = Math.max(BOX / w, BOX / h) * view.zoom;
  const dw = w * base * k, dh = h * base * k;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" draggable={false} className="pointer-events-none absolute max-w-none select-none"
      style={{ width: dw, height: dh, left: size / 2 - dw / 2 + view.x * k, top: size / 2 - dh / 2 + view.y * k }} />
  );
}

/** `autoSubmit` sends the form as soon as the crop is saved (profile); off for longer forms (onboarding), where it just fills the field. */
export function PhotoCropInput({ name = "photo", current, initials, submitLabel = "Save photo", autoSubmit = true, required = false, invalid = false }: { name?: string; current?: string | null; initials: string; submitLabel?: string; autoSubmit?: boolean; required?: boolean; invalid?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<{ url: string; w: number; h: number } | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [saved, setSaved] = useState<string | null>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  // Keep the picture covering the round frame: no empty edges whatever the zoom.
  const clamp = (v: View, s = src): View => {
    if (!s) return v;
    const base = Math.max(BOX / s.w, BOX / s.h) * v.zoom;
    const mx = Math.max(0, (s.w * base - BOX) / 2), my = Math.max(0, (s.h * base - BOX) / 2);
    return { zoom: v.zoom, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
  };
  const zoomTo = (z: number) => setView((v) => clamp({ ...v, zoom: Math.min(4, Math.max(1, z)) }));

  const load = (url: string) => {
    const img = new Image();
    img.onload = () => { setSrc({ url, w: img.naturalWidth, h: img.naturalHeight }); setView({ zoom: 1, x: 0, y: 0 }); };
    img.src = url;
  };
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { alert("Choose a JPG, PNG or WebP picture."); return; }
    const r = new FileReader();
    r.onload = () => load(String(r.result));
    r.readAsDataURL(f);
  };
  // Rotate a quarter turn by redrawing the picture turned.
  const rotate = () => {
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalHeight; c.height = img.naturalWidth;
      const g = c.getContext("2d")!;
      g.translate(c.width / 2, c.height / 2); g.rotate(Math.PI / 2); g.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      load(c.toDataURL("image/jpeg", 0.95));
    };
    img.src = src.url;
  };

  const close = () => { setSrc(null); if (input.current && !saved) input.current.value = ""; };
  useEffect(() => {
    if (!src) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  });

  const save = () => {
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = OUT; c.height = OUT;
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff"; g.fillRect(0, 0, OUT, OUT);
      const k = OUT / BOX, base = Math.max(BOX / src.w, BOX / src.h) * view.zoom;
      const dw = src.w * base * k, dh = src.h * base * k;
      g.imageSmoothingQuality = "high";
      g.drawImage(img, OUT / 2 - dw / 2 + view.x * k, OUT / 2 - dh / 2 + view.y * k, dw, dh);
      c.toBlob((blob) => {
        if (!blob || !input.current) return;
        const dt = new DataTransfer();
        dt.items.add(new File([blob], "profile.jpg", { type: "image/jpeg" }));
        input.current.files = dt.files;
        setSaved(c.toDataURL("image/jpeg", 0.9));
        setSrc(null);
        if (autoSubmit) input.current.form?.requestSubmit();
      }, "image/jpeg", 0.9);
    };
    img.src = src.url;
  };

  const shown = saved ?? current;
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} className={`group relative size-14 shrink-0 overflow-hidden rounded-full bg-navy-900 text-base font-semibold text-white ${invalid ? "ring-2 ring-red-400" : ""}`} aria-label="Change profile picture">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {shown ? <img src={shown} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center">{initials}</span>}
        <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition group-hover:opacity-100"><Camera className="size-5" /></span>
      </button>
      <button type="button" onClick={() => input.current?.click()} className="h-8 rounded-md bg-navy-900 px-3 text-xs font-medium text-white hover:bg-navy-800">{shown ? "Change picture" : "Choose picture"}</button>
      <input ref={input} name={name} type="file" required={required} accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="Profile picture" onChange={(e) => { setSaved(null); pick(e.target.files?.[0]); }} />

      {src && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Crop profile picture" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="font-semibold">Adjust your picture</h2>
              <button type="button" onClick={close} className="rounded-md p-1 text-muted hover:bg-canvas" aria-label="Close"><X className="size-5" /></button>
            </div>
            <div className="grid gap-6 p-5 sm:grid-cols-[auto_1fr]">
              <div className="mx-auto">
                <div className="relative cursor-grab touch-none overflow-hidden rounded-xl bg-black/80 active:cursor-grabbing" style={{ width: BOX, height: BOX }}
                  onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y }; }}
                  onPointerMove={(e) => { const d = drag.current; if (d) setView((v) => clamp({ ...v, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py })); }}
                  onPointerUp={() => { drag.current = null; }}
                  onWheel={(e) => zoomTo(view.zoom - e.deltaY * 0.002)}>
                  <Placed src={src.url} w={src.w} h={src.h} view={view} size={BOX} />
                  <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-2 ring-white/80" />
                </div>
                <div className="mt-3 flex items-center gap-2" style={{ width: BOX }}>
                  <button type="button" onClick={() => zoomTo(view.zoom - 0.2)} className="rounded-md p-1.5 text-muted hover:bg-canvas" aria-label="Zoom out"><ZoomOut className="size-4" /></button>
                  <input type="range" min={1} max={4} step={0.01} value={view.zoom} onChange={(e) => zoomTo(Number(e.target.value))} className="flex-1 accent-navy-900" aria-label="Zoom" />
                  <button type="button" onClick={() => zoomTo(view.zoom + 0.2)} className="rounded-md p-1.5 text-muted hover:bg-canvas" aria-label="Zoom in"><ZoomIn className="size-4" /></button>
                  <button type="button" onClick={rotate} className="rounded-md p-1.5 text-muted hover:bg-canvas" aria-label="Rotate" title="Rotate"><RotateCw className="size-4" /></button>
                </div>
                <p className="mt-1 text-center text-xs text-muted">Drag to move · scroll or slide to zoom</p>
              </div>
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Preview</p>
                <div className="flex items-end gap-4">
                  {[112, 56, 36].map((s) => (
                    <div key={s} className="text-center">
                      <div className="relative overflow-hidden rounded-full bg-canvas ring-1 ring-line" style={{ width: s, height: s }}><Placed src={src.url} w={src.w} h={src.h} view={view} size={s} /></div>
                      <span className="mt-1 block text-[10px] text-muted">{s === 112 ? "Profile" : s === 56 ? "Lists" : "Menu"}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex items-center gap-3 rounded-xl border border-line p-3">
                  <div className="relative size-10 shrink-0 overflow-hidden rounded-full"><Placed src={src.url} w={src.w} h={src.h} view={view} size={40} /></div>
                  <div className="min-w-0 text-sm"><p className="font-medium">How others see you</p><p className="text-xs text-muted">In chats, the sidebar and the team list</p></div>
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  <button type="button" onClick={save} className="h-9 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800">{submitLabel}</button>
                  <button type="button" onClick={() => setView({ zoom: 1, x: 0, y: 0 })} className="h-9 rounded-lg border border-line px-4 text-sm hover:bg-canvas">Reset</button>
                  <button type="button" onClick={() => input.current?.click()} className="h-9 rounded-lg border border-line px-4 text-sm hover:bg-canvas">Choose another</button>
                  <button type="button" onClick={close} className="h-9 rounded-lg px-4 text-sm text-muted hover:bg-canvas">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
