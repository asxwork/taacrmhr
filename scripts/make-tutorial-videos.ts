// Rebuilds the tutorial videos (public/tutorials/sections/<key>.mp4) as sharp 1920×1080 videos:
// one crisp screenshot of the tutorial's page per step, with the step written on screen, timed to the existing
// voice-over (split at its pauses). Tutorials without a voice-over (new or rewritten guides) get a silent video
// with the same captions, each step held long enough to read.
//
// Run against a local AMS with demo data (never real data):
//   DATABASE_URL=file:./dev.db npx next start -p 3100
//   BASE=http://localhost:3100 LOGIN=admin PASSWORD=… npx tsx scripts/make-tutorial-videos.ts [key …]
// Options: SILENT=key1,key2 (ignore the old voice-over for guides whose text changed), ALL=1 (also make videos for
// guides that have none yet).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { TUTORIALS, type Tutorial } from "../src/lib/tutorials";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = path.resolve("public/tutorials/sections");
const INDEX = path.join(OUT, "index.json");
const SILENT = new Set((process.env.SILENT ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const W = 1280, H = 720, SCALE = 1.5; // 1920×1080 frames

const FALLBACK: Record<Tutorial["group"], string> = {
  "Getting started": "/dashboard", CRM: "/crm/leads", Calls: "/calls", HR: "/hr", Finance: "/finance", "My Space": "/me", Admin: "/settings",
};

type Slide = { eyebrow: string; text: string; step?: [number, number]; intro?: boolean };

function slidesFor(t: Tutorial): Slide[] {
  return [{ eyebrow: t.group, text: t.summary, intro: true }, ...t.steps.map((s, i) => ({ eyebrow: t.title, text: s, step: [i + 1, t.steps.length] as [number, number] }))];
}

const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).toString();
const duration = (file: string) => Number(sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim());

/** Spoken parts of a voice-over: the stretches between pauses of 0.6 s or more. */
function speech(file: string): { start: number; end: number }[] {
  let log = "";
  try { execFileSync("ffmpeg", ["-v", "info", "-i", file, "-af", "silencedetect=noise=-35dB:d=0.6", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] }); } catch (e) { log = String((e as { stderr?: Buffer }).stderr ?? ""); }
  if (!log) log = execFileSync("sh", ["-c", `ffmpeg -v info -i "${file}" -af silencedetect=noise=-35dB:d=0.6 -f null - 2>&1`]).toString();
  const total = duration(file);
  const silences: [number, number][] = [];
  let open: number | null = null;
  for (const m of log.matchAll(/silence_(start|end): ([\d.]+)/g)) {
    if (m[1] === "start") open = Number(m[2]);
    else if (open !== null) { silences.push([open, Number(m[2])]); open = null; }
  }
  if (open !== null) silences.push([open, total]);
  const parts: { start: number; end: number }[] = [];
  let at = 0;
  for (const [s, e] of silences) { if (s - at > 0.3) parts.push({ start: at, end: s }); at = e; }
  if (total - at > 0.3) parts.push({ start: at, end: total });
  return parts;
}

/** Make the spoken parts line up with the slides: join the closest pairs, or split the longest. */
function fit(parts: { start: number; end: number }[], n: number) {
  const p = parts.map((x) => ({ ...x }));
  while (p.length > n) {
    let best = 1;
    for (let i = 2; i < p.length; i++) if (p[i]!.start - p[i - 1]!.end < p[best]!.start - p[best - 1]!.end) best = i;
    p[best - 1]!.end = p[best]!.end; p.splice(best, 1);
  }
  while (p.length < n && p.length) {
    let big = 0;
    for (let i = 1; i < p.length; i++) if (p[i]!.end - p[i]!.start > p[big]!.end - p[big]!.start) big = i;
    const mid = (p[big]!.start + p[big]!.end) / 2;
    p.splice(big, 1, { start: p[big]!.start, end: mid }, { start: mid, end: p[big]!.end });
  }
  return p;
}

const OVERLAY_CSS = `
  #tut-ov { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; font-family: Inter, system-ui, sans-serif; }
  #tut-ov .card { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); width: min(880px, calc(100% - 64px));
    background: rgba(255,255,255,.97); border-radius: 16px; box-shadow: 0 18px 50px rgba(15,23,42,.28), 0 0 0 1px rgba(15,23,42,.06);
    border-left: 5px solid #b8913a; padding: 18px 24px 16px; color: #0f172a; }
  #tut-ov .eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #9a7a2e; display: flex; justify-content: space-between; }
  #tut-ov .text { margin-top: 6px; font-size: 21px; line-height: 1.38; font-weight: 500; }
  #tut-ov .bar { margin-top: 12px; display: flex; gap: 5px; }
  #tut-ov .bar i { flex: 1; height: 4px; border-radius: 4px; background: #e2e8f0; }
  #tut-ov .bar i.on { background: #0b1f3a; }
  #tut-ov .intro { position: absolute; inset: 0; background: linear-gradient(135deg, rgba(8,20,40,.95), rgba(12,30,58,.9)); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; }
  #tut-ov .intro div { max-width: 820px; padding: 0 40px; color: #fff; }
  #tut-ov .intro p.k { font-size: 14px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #e0c27a; }
  #tut-ov .intro h1 { margin: 10px 0 14px; font: 600 50px/1.15 var(--font-display, "Playfair Display"), Georgia, serif; }
  #tut-ov .intro p.s { font-size: 22px; line-height: 1.45; color: rgba(255,255,255,.88); }
  /* Keep the frame clean: help button, toasts, notification prompts. */
  [aria-label="How to use this page"], .toast, [role="status"].fixed { display: none !important; }
`;

async function show(page: Page, t: Tutorial, s: Slide) {
  // Plain JS text (the TypeScript runner adds helpers that don't exist inside the browser).
  const esc = (x: string) => x.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const html = s.intro
    ? `<div class="intro"><div><p class="k">${esc(s.eyebrow)} · AMS tutorial</p><h1>${esc(t.title)}</h1><p class="s">${esc(s.text)}</p></div></div>`
    : `<div class="card"><div class="eyebrow"><span>${esc(s.eyebrow)}</span><span>Step ${s.step![0]} of ${s.step![1]}</span></div><div class="text">${esc(s.text)}</div><div class="bar">${Array.from({ length: s.step![1] }, (_, i) => `<i class="${i < s.step![0] ? "on" : ""}"></i>`).join("")}</div></div>`;
  await page.evaluate(`(() => {
    document.getElementById("tut-ov")?.remove();
    if (!document.getElementById("tut-css")) { const st = document.createElement("style"); st.id = "tut-css"; st.textContent = ${JSON.stringify(OVERLAY_CSS)}; document.head.appendChild(st); }
    const ov = document.createElement("div"); ov.id = "tut-ov"; ov.innerHTML = ${JSON.stringify(html)};
    document.body.appendChild(ov);
  })()`);
  await page.waitForTimeout(120);
}

async function main() {
  const index: Record<string, number> = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, "utf8")) : {};
  const wanted = process.argv.slice(2);
  const list = TUTORIALS.filter((t) => (wanted.length ? wanted.includes(t.key) : index[t.key] !== undefined || process.env.ALL === "1"));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, colorScheme: "light" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("input[name=email]", process.env.LOGIN ?? "admin");
  await page.fill("input[name=password]", process.env.PASSWORD ?? "");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });

  const report: string[] = [];
  for (const t of list) {
    const dir = path.join(tmpdir(), `tut-${t.key}`);
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    const old = path.join(OUT, `${t.key}.mp4`);
    const slides = slidesFor(t);
    // The existing voice-over, unless this guide's text changed since it was recorded.
    let audio: string | null = null;
    let times: { start: number; end: number }[];
    if (existsSync(old) && !SILENT.has(t.key) && sh("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", old]).trim()) {
      audio = path.join(dir, "voice.m4a");
      sh("ffmpeg", ["-v", "error", "-y", "-i", old, "-vn", "-c:a", "copy", audio]);
      const total = duration(audio);
      const parts = fit(speech(audio), slides.length);
      if (parts.length !== slides.length) { audio = null; times = []; }
      else times = parts.map((p, i) => ({ start: i === 0 ? 0 : Math.max(0, p.start - 0.25), end: i === parts.length - 1 ? total : Math.max(0, parts[i + 1]!.start - 0.25) }));
      const raw = speech(audio ?? old).length;
      if (Math.abs(raw - slides.length) >= 2) report.push(`${t.key}: voice has ${raw} parts for ${slides.length} slides — check it, or rebuild with SILENT=${t.key}`);
    } else times = [];
    if (!audio) {
      let at = 0;
      times = slides.map((s) => { const d = Math.min(12, Math.max(4.5, 2.5 + s.text.length * 0.055)); const r = { start: at, end: at + d }; at += d; return r; });
    }

    await page.goto(`${BASE}${t.href ?? FALLBACK[t.group]}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1200);
    const list2: string[] = [];
    for (let i = 0; i < slides.length; i++) {
      await show(page, t, slides[i]!);
      const png = path.join(dir, `s${i}.png`);
      await page.screenshot({ path: png });
      list2.push(`file '${png}'`, `duration ${(times[i]!.end - times[i]!.start).toFixed(3)}`);
    }
    list2.push(`file '${path.join(dir, `s${slides.length - 1}.png`)}'`);
    writeFileSync(path.join(dir, "list.txt"), list2.join("\n"));
    const out = path.join(dir, "out.mp4");
    const total = times[times.length - 1]!.end;
    sh("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"), ...(audio ? ["-i", audio] : []),
      "-vf", "fps=25,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-tune", "stillimage", "-crf", "21", "-g", "250",
      ...(audio ? ["-c:a", "copy"] : ["-an"]), "-t", total.toFixed(2), "-movflags", "+faststart", out]);
    renameSync(out, old);
    // Still preview shown before the video starts (the title screen), so the player never looks empty.
    sh("ffmpeg", ["-v", "error", "-y", "-ss", "0.5", "-i", old, "-frames:v", "1", "-vf", "scale=960:-1", "-q:v", "5", old.replace(/\.mp4$/, ".jpg")]);
    index[t.key] = Math.round(total);
    rmSync(dir, { recursive: true, force: true });
    console.log(`✓ ${t.key} (${slides.length} slides, ${Math.round(total)}s${audio ? ", voice" : ", silent"})`);
  }
  writeFileSync(INDEX, JSON.stringify(index, null, 1));
  await browser.close();
  if (report.length) console.log(`\nCheck these:\n${report.join("\n")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
