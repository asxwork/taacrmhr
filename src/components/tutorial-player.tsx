"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

export type Chapter = { t: number; text: string };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const SPEEDS = [1, 1.25, 1.5, 2];

/**
 * Light, smooth video player for the how-to videos: a still image shows at once and the video fades in over it,
 * a big play button, a clean control strip (no dark gradient), speed and sound, and the steps list follows the
 * video (click a step to jump to it).
 */
export function TutorialPlayer({ src, poster, chapters, steps, autoPlay = true }: { src: string; poster?: string; chapters?: Chapter[] | null; steps?: string[]; autoPlay?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [ended, setEnded] = useState(false);

  useEffect(() => { setReady(false); setPlaying(false); setTime(0); setEnded(false); }, [src]);
  useEffect(() => { if (video.current) video.current.playbackRate = speed; }, [speed]);

  const play = async () => {
    const v = video.current; if (!v) return;
    if (ended) { v.currentTime = 0; setEnded(false); }
    try { await v.play(); } catch { v.muted = true; setMuted(true); await v.play().catch(() => {}); }
  };
  const toggle = () => (playing ? video.current?.pause() : void play());
  const seek = (t: number) => { const v = video.current; if (!v) return; v.currentTime = Math.max(0, Math.min(t, dur || t)); setEnded(false); if (!playing) void play(); };
  const current = chapters?.length ? chapters.reduce((a, c, i) => (time + 0.25 >= c.t ? i : a), 0) : -1;

  return (
    <div>
      <div ref={box} className="group relative aspect-video w-full overflow-hidden bg-canvas">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {poster && <img src={poster} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className={cn("absolute inset-0 size-full object-cover transition-opacity duration-500", ready && "opacity-0")} />}
        {!poster && !ready && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-canvas to-white" />}
        <video ref={video} key={src} src={src} playsInline preload="auto" autoPlay={autoPlay}
          onCanPlay={() => setReady(true)} onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setEnded(true); }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} onClick={toggle}
          className={cn("absolute inset-0 size-full cursor-pointer object-contain transition-opacity duration-500", ready ? "opacity-100" : "opacity-0")} />
        {(!playing || ended) && (
          <button type="button" onClick={() => void play()} aria-label={ended ? "Watch again" : "Play"}
            className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-navy-900 shadow-xl ring-1 ring-black/5 transition hover:scale-105">
            {ended ? <RotateCcw className="size-7" /> : <Play className="ml-1 size-7 fill-current" />}
          </button>
        )}
        <div className={cn("absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-xl bg-white/90 px-2.5 py-1.5 text-navy-900 shadow-md ring-1 ring-black/5 backdrop-blur transition-opacity", playing && !ended ? "opacity-0 group-hover:opacity-100 focus-within:opacity-100" : "opacity-100")}>
          <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="rounded-md p-1 hover:bg-black/5">{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
          <div className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-navy-900/15" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * dur); }} role="slider" aria-label="Position" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(time)} tabIndex={0}
            onKeyDown={(e) => { if (e.key === "ArrowRight") seek(time + 5); if (e.key === "ArrowLeft") seek(time - 5); }}>
            <div className="absolute inset-y-0 left-0 rounded-full bg-gold-500" style={{ width: `${dur ? (time / dur) * 100 : 0}%` }} />
            {chapters?.map((c, i) => i > 0 && dur ? <span key={i} className="absolute top-0 h-1.5 w-0.5 bg-white" style={{ left: `${(c.t / dur) * 100}%` }} /> : null)}
          </div>
          <span className="w-20 text-right text-[11px] tabular-nums text-muted">{mmss(time)} / {mmss(dur)}</span>
          <button type="button" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)} className="min-w-9 rounded-md px-1 py-0.5 text-[11px] font-semibold hover:bg-black/5" aria-label="Speed">{speed}×</button>
          <button type="button" onClick={() => { const v = video.current; if (v) { v.muted = !v.muted; setMuted(v.muted); } }} aria-label={muted ? "Sound on" : "Sound off"} className="rounded-md p-1 hover:bg-black/5">{muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
          <button type="button" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen?.())} aria-label="Full screen" className="hidden rounded-md p-1 hover:bg-black/5 sm:block"><Maximize2 className="size-4" /></button>
        </div>
      </div>
      {(chapters?.length || steps?.length) ? (
        <ol className="space-y-1 px-3 py-3">
          {(chapters?.length ? chapters : (steps ?? []).map((text) => ({ t: -1, text }))).map((c, i) => (
            <li key={i}>
              <button type="button" disabled={c.t < 0} onClick={() => seek(c.t)}
                className={cn("flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors", c.t >= 0 && "hover:bg-canvas", i === current && "bg-gold-400/15")}>
                <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", i === current ? "bg-gold-500 text-white" : "bg-canvas text-muted")}>{chapters?.length ? (i === 0 ? "•" : i) : i + 1}</span>
                <span className={cn("flex-1", i === current ? "text-ink" : "text-ink/80")}>{c.text}</span>
                {c.t >= 0 && <span className="shrink-0 text-[11px] tabular-nums text-muted">{mmss(c.t)}</span>}
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
