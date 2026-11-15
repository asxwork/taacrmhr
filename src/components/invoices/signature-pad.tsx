"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

/** Draw a signature with finger, pen or mouse. The PNG goes into a hidden field (name) for the form. */
export function SignaturePad({ name = "signature", label = "Sign here" }: { name?: string; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState("");
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0b1f3a";
  }, []);

  const point = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent) => { e.preventDefault(); canvas.current!.setPointerCapture(e.pointerId); drawing.current = true; last.current = point(e); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!, p = point(e);
    ctx.beginPath(); ctx.moveTo(last.current!.x, last.current!.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
  };
  const up = () => { if (!drawing.current) return; drawing.current = false; setData(canvas.current!.toDataURL("image/png")); };
  const clear = () => { const c = canvas.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setData(""); };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm font-medium"><span>{label}</span><button type="button" onClick={clear} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><Eraser className="size-3.5" /> Clear</button></div>
      <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        className="h-36 w-full touch-none rounded-lg border-2 border-dashed border-line bg-white" aria-label={label} />
      <input type="hidden" name={name} value={data} />
      {!data && <p className="mt-1 text-xs text-muted">Use your finger on a phone, or the mouse on a computer.</p>}
    </div>
  );
}
