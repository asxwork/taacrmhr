// The AMS notification sounds, made in the browser (no audio files): a soft three-note chime for a notification,
// a brighter double chime for urgent ones and a short two-note pop for a chat message. Off/on per device
// (Profile → Notifications), and only one open tab plays it.
"use client";

export type AmsSound = "notify" | "urgent" | "chat";
const KEY = "ams:sound";
let ctx: AudioContext | null = null;

export const soundOn = () => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } };
export const setSoundOn = (on: boolean) => { try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode */ } };

/** Browsers only allow sound after the person has clicked or typed on the page once. */
export function unlockSound() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
  } catch { /* no audio */ }
}

function bell(c: AudioContext, freq: number, at: number, len: number, vol: number) {
  for (const [mult, gain] of [[1, 1], [2.01, 0.25], [3.02, 0.08]] as const) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol * gain, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(c.destination);
    o.start(at); o.stop(at + len + 0.05);
  }
}

export function playAmsSound(kind: AmsSound, opts: { force?: boolean } = {}) {
  if (!opts.force && !soundOn()) return;
  // One tab plays it: the first to claim this second.
  try {
    const last = Number(localStorage.getItem("ams:soundAt") ?? 0);
    if (!opts.force && Date.now() - last < 2500) return;
    localStorage.setItem("ams:soundAt", String(Date.now()));
  } catch { /* fine */ }
  unlockSound();
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime + 0.02;
  if (kind === "chat") { bell(ctx, 880, t, 0.25, 0.18); bell(ctx, 1318.5, t + 0.09, 0.35, 0.16); return; }
  // E5 G#5 B5: the AMS chime. Urgent plays it brighter, twice.
  const notes = kind === "urgent" ? [783.99, 987.77, 1174.66] : [659.25, 830.61, 987.77];
  const play = (start: number) => notes.forEach((f, i) => bell(ctx!, f, start + i * 0.11, 0.9, kind === "urgent" ? 0.22 : 0.16));
  play(t);
  if (kind === "urgent") play(t + 0.55);
}
