// Rebuilds the tutorial videos (public/tutorials/sections/<key>.mp4) as sharp 1920×1080 screen recordings:
// for each step a mouse pointer glides to the button, tab or field the step talks about, it's highlighted and the
// camera zooms in on it; "Open A → B" steps click through the menu to the next page and "Type “…”" steps type it.
// The step is written in a caption box. Timed to the existing voice-over (split at its pauses); tutorials without
// one get a silent video with each step held long enough to read. Only links are clicked (never buttons), so making
// the videos changes no data.
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
const W = 1280, H = 720, SCALE = 2; // captured at 2560×1440 so zoomed-in shots stay sharp; videos are 1920×1080

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

const FPS = 15;
const ease = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));
type Box = { x: number; y: number; w: number; h: number; link: string | null; input: boolean } | null;

/**
 * What a step points at, best first: each item of "A → B → C" (last first), what follows "press / click / pick…",
 * quoted words, then names of two or more capitalised words. Each is also tried shorter ("Closed deals lists them…"
 * → "Closed deals"), longest first, because the page decides where a name ends.
 */
function targetsFor(step: string) {
  const words = (x: string) => x.replace(/[“”"().,:;]/g, " ").trim().split(/\s+/).filter(Boolean);
  const STOP = /^(open|press|click|tap|pick|choose|tick|type|use|the|a|an|and|or|on|in|to|then|new|all|my|your)$/i;
  const prefixes = (x: string) => { const w = words(x).slice(0, 5); return w.map((_, i) => w.slice(0, w.length - i).join(" ")).filter((p) => p.length >= 3 && !STOP.test(p) && !/^[a-z]/.test(p)); };
  const parts = step.split("→");
  const chain = parts.length > 1 ? parts.map((x, i) => (i === 0 ? (x.match(/([A-Z][\w&'’-]*(?:\s+[A-Za-z&][\w&'’-]*){0,2})\s*$/)?.[1] ?? "") : x).trim().replace(/^(Open|Go to|In)\s+/, "")).filter((x) => x && /^[A-Z0-9]/.test(x)) : [];
  const quotes = [...step.matchAll(/[“"]([^”"]{2,40})[”"]/g)].map((m) => m[1]!);
  const verbs = [...step.matchAll(/\b(?:press|click|tap|pick|choose|tick|open|select|use|turn on|switch to)\s+(?:the\s+|on\s+)?([A-Z][\w&'’+ -]{1,40})/gi)].map((m) => m[1]!);
  const titles = [...step.matchAll(/\b([A-Z][a-z]+(?:\s(?:&\s)?[A-Z][a-z]+){1,3})\b/g)].map((m) => m[1]!);
  const out: string[] = [];
  for (const x of [...chain.slice().reverse().flatMap(prefixes), ...verbs.flatMap(prefixes), ...quotes, ...titles]) if (x && !out.includes(x)) out.push(x);
  const typed = /\btype\b/i.test(step) ? quotes[0] : undefined;
  return { chain, labels: out.slice(0, 24), typed };
}

// Runs in the page (plain JS text: the TypeScript runner adds helpers that don't exist in the browser).
const FX = `(() => {
  if (window.__tut) return;
  const css = document.createElement("style"); css.id = "tut-fx-css";
  css.textContent = ".tut-fx{position:fixed;pointer-events:none;z-index:2147483646}" +
    "#tut-cursor{width:30px;height:30px;left:0;top:0;transform-origin:4px 3px;filter:drop-shadow(0 3px 5px rgba(0,0,0,.35))}" +
    "#tut-ring{border:3px solid #c9a24a;border-radius:12px;box-shadow:0 0 0 9999px rgba(10,22,40,.22),0 0 24px rgba(201,162,74,.75);opacity:0}" +
    "#tut-ripple{width:44px;height:44px;border-radius:50%;border:3px solid #c9a24a;opacity:0}" +
    "html.tut-caption body>*:not(#tut-ov),html.tut-caption .tut-fx{visibility:hidden!important}html.tut-caption,html.tut-caption body{background:transparent!important}" +
    "html.tut-page #tut-ov{display:none!important}";
  document.head.appendChild(css);
  const mk = (id, html) => { const d = document.createElement("div"); d.id = id; d.className = "tut-fx"; d.innerHTML = html || ""; document.documentElement.appendChild(d); return d; };
  const cur = mk("tut-cursor", '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2l7.5 19 2.6-7.4L21 11z" fill="#fff" stroke="#0b1f3a" stroke-width="1.6" stroke-linejoin="round"/></svg>');
  const ring = mk("tut-ring"), rip = mk("tut-ripple");
  const visible = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 4 && r.height > 4 && st.visibility !== "hidden" && st.display !== "none" && !el.closest("#tut-ov,.tut-fx") };
  const textOf = (el) => (el.tagName === "INPUT" || el.tagName === "TEXTAREA" ? (el.placeholder || el.getAttribute("aria-label") || "") : (el.getAttribute("aria-label") && !el.innerText.trim() ? el.getAttribute("aria-label") : el.innerText || "")).replace(/\\s+/g, " ").trim();
  window.__tut = {
    find(labels) {
      const els = [...document.querySelectorAll("a,button,[role=tab],summary,th,label,h1,h2,h3,legend,select,input:not([type=hidden]),textarea,option,dt")];
      for (const raw of labels) {
        const want = raw.toLowerCase();
        let best = null, bestScore = 1e9;
        for (const el0 of els) {
          const el = el0.tagName === "OPTION" ? el0.closest("select") : el0;
          if (!el || !visible(el)) continue;
          const t = textOf(el0).toLowerCase();
          if (!t || t.length > 90) continue;
          const word = (" " + t + " ").includes(" " + want + " ");
          let score = t === want ? 0 : t.startsWith(want + " ") ? 10 : want.length >= 4 && word ? 20 : -1;
          if (score < 0) continue;
          score += t.length / 10 + (el.closest("nav,aside") ? 3 : 0);
          if (score < bestScore) { bestScore = score; best = el; }
        }
        if (best) {
          best.scrollIntoView({ block: "center", inline: "nearest" });
          const r = best.getBoundingClientRect();
          const a = best.closest("a[href]");
          const href = a ? a.getAttribute("href") : null;
          const safe = href && href.startsWith("/") && !/logout|sign-?out|delete|\\/api\\//i.test(href) ? href : null;
          return { x: r.left, y: r.top, w: r.width, h: r.height, link: safe, input: best.tagName === "INPUT" || best.tagName === "TEXTAREA" };
        }
      }
      return null;
    },
    cursor(x, y, s) { cur.style.transform = "translate(" + (x - 4) + "px," + (y - 3) + "px) scale(" + s + ")"; cur.style.opacity = "1"; },
    ring(b, o) { if (!b) { ring.style.opacity = "0"; return; } Object.assign(ring.style, { left: (b.x - 6) + "px", top: (b.y - 6) + "px", width: (b.w + 12) + "px", height: (b.h + 12) + "px", opacity: String(o) }); },
    ripple(x, y, p) { Object.assign(rip.style, { left: (x - 22) + "px", top: (y - 22) + "px", opacity: String(p > 0 && p < 1 ? 1 - p : 0), transform: "scale(" + (0.4 + p * 1.3) + ")" }); },
    type(b, text) { const el = document.elementFromPoint(b.x + b.w / 2, b.y + b.h / 2); const inp = el && (el.closest("input,textarea") || el.querySelector?.("input,textarea")); if (inp) { const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(inp), "value").set; set.call(inp, text); inp.dispatchEvent(new Event("input", { bubbles: true })); } },
    mode(m) { document.documentElement.classList.toggle("tut-caption", m === "caption"); document.documentElement.classList.toggle("tut-page", m === "page"); },
  };
})()`;

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
  const ready = async () => { await page.evaluate(FX); };

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
      times = slides.map((s) => { const d = Math.min(12, Math.max(4.5, 3 + s.text.length * 0.055)); const r = { start: at, end: at + d }; at += d; return r; });
    }

    // SHOTS='{"lead-page":"/crm/leads/<id>"}' films guides that have no page link of their own on a real example.
    const shots = JSON.parse(process.env.SHOTS ?? "{}") as Record<string, string>;
    await page.goto(`${BASE}${shots[t.key] ?? t.href ?? FALLBACK[t.group]}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1200);
    await ready();
    let cx = W * 0.62, cy = H * 0.55; // where the pointer is
    const segs: string[] = [];
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i]!;
      const dur = times[i]!.end - times[i]!.start;
      const sd = path.join(dir, `s${i}`); mkdirSync(sd);
      await show(page, t, s);
      await ready();
      // The caption on its own (transparent), laid over the moving page by ffmpeg so it never zooms.
      await page.evaluate("window.__tut.mode('caption')");
      await page.screenshot({ path: path.join(sd, "cap.png"), omitBackground: true });
      await page.evaluate("window.__tut.mode('page')");
      let n = 0;
      const frame = async () => { await page.screenshot({ path: path.join(sd, `f${String(n++).padStart(3, "0")}.png`) }); };
      let zoom = { z: 1.04, x: W / 2, y: H / 2, from: 0.3 }; // gentle drift when nothing is pointed at
      if (s.intro) {
        await page.evaluate("document.getElementById('tut-cursor').style.opacity='0';window.__tut.ring(null,0);window.__tut.mode('none')"); await frame();
      } else {
        const { chain, labels, typed } = targetsFor(s.text);
        // Steps about the search box open it (Ctrl + E) so the typing shows.
        if (/Ctrl \+ E/.test(s.text)) { await page.keyboard.press("Control+e"); await page.waitForTimeout(500); }
        let box = (await page.evaluate(`window.__tut.find(${JSON.stringify(labels)})`)) as Box;
        if (typed && !box?.input) {
          // "Type “…”": the text box that has the focus (or the first one on the page).
          box = (await page.evaluate(`(() => { const el = (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName) ? document.activeElement : [...document.querySelectorAll("input[type=text],input[type=search],input:not([type]),textarea")].find((e) => e.getBoundingClientRect().width > 40)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, link: null, input: true }; })()`)) as Box ?? box;
        }
        if (!box) {
          await page.evaluate(`window.__tut.ring(null,0);window.__tut.cursor(${cx},${cy},1)`); await frame();
        } else {
          const tx = box.x + Math.min(box.w / 2, 60), ty = box.y + box.h / 2;
          const move = Math.round(FPS * 0.9);
          for (let k = 1; k <= move; k++) {
            const p = ease(k / move), bend = Math.sin(p * Math.PI) * 30;
            await page.evaluate(`window.__tut.cursor(${cx + (tx - cx) * p},${cy + (ty - cy) * p - bend},1);window.__tut.ring(${JSON.stringify(box)},${Math.max(0, (p - 0.5) * 2)})`);
            await frame();
          }
          cx = tx; cy = ty;
          // Click: a little press and a ripple.
          for (let k = 1; k <= 6; k++) { await page.evaluate(`window.__tut.cursor(${cx},${cy},${k < 3 ? 0.85 : 1});window.__tut.ripple(${cx},${cy},${k / 6})`); await frame(); }
          if (typed && box.input) {
            for (let k = 1; k <= typed.length; k++) { await page.evaluate(`window.__tut.type(${JSON.stringify(box)},${JSON.stringify(typed.slice(0, k))})`); if (k % 2 === 0 || k === typed.length) await frame(); }
            await page.waitForTimeout(700); await frame();
          }
          const goes = box.link && chain.length > 0 && !page.url().endsWith(box.link);
          if (goes) {
            // A menu step: follow the link, so the next steps show the page it leads to.
            await page.goto(`${BASE}${box.link}`, { waitUntil: "networkidle" }).catch(() => {});
            await page.waitForTimeout(900); await ready(); await show(page, t, s); await ready();
            await page.evaluate(`window.__tut.mode('page');window.__tut.ring(null,0);window.__tut.cursor(${cx},${cy},1)`); await frame();
          } else {
            const z = Math.min(1.45, Math.max(1.2, Math.min(W / (box.w * 4), H / (box.h * 5))));
            zoom = { z, x: box.x + box.w / 2, y: box.y + box.h / 2, from: n / FPS };
          }
        }
      }
      // ffmpeg: the frames, held to the step's length, zoomed in on the target (and out again at the end), caption on top.
      const motion = n / FPS, rest = Math.max(0.1, dur - motion);
      const a = zoom.from, b = a + 0.8, e = Math.max(b + 0.3, dur - 0.6);
      const sm = (q: string) => `(${q})*(${q})*(3-2*(${q}))`;
      const tt = `(on/${FPS})`;
      const zexp = `1+${(zoom.z - 1).toFixed(3)}*if(lt(${tt},${a}),0,if(lt(${tt},${b}),${sm(`(${tt}-${a})/0.8`)},if(lt(${tt},${e}),1,${sm(`max(0,(${dur.toFixed(2)}-${tt})/0.6)`)})))`;
      const px = (zoom.x * SCALE).toFixed(0), py = (zoom.y * SCALE).toFixed(0);
      const seg = path.join(dir, `seg${i}.mp4`);
      sh("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", path.join(sd, "f%03d.png"), "-i", path.join(sd, "cap.png"), "-filter_complex",
        `[0]tpad=stop_mode=clone:stop_duration=${rest.toFixed(2)},zoompan=z='${zexp}':x='min(max(${px}-iw/zoom/2,0),iw-iw/zoom)':y='min(max(${py}-ih/zoom/2,0),ih-ih/zoom)':d=1:s=1920x1080:fps=${FPS}[v];[1]scale=1920:1080[c];[v][c]overlay=0:0,format=yuv420p`,
        "-t", dur.toFixed(3), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", String(FPS), seg]);
      segs.push(`file '${seg}'`);
    }
    writeFileSync(path.join(dir, "list.txt"), segs.join("\n"));
    const out = path.join(dir, "out.mp4");
    const total = times[times.length - 1]!.end;
    sh("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"), ...(audio ? ["-i", audio] : []),
      // One keyframe every 2 s keeps seeking quick; small file for slow PCs and phones.
      "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-g", String(FPS * 2), "-pix_fmt", "yuv420p",
      ...(audio ? ["-c:a", "copy"] : ["-an"]), "-t", total.toFixed(2), "-movflags", "+faststart", out]);
    renameSync(out, old);
    // Still preview shown before the video starts (the title screen), so the player never looks empty.
    sh("ffmpeg", ["-v", "error", "-y", "-ss", "0.5", "-i", old, "-frames:v", "1", "-vf", "scale=960:-1", "-q:v", "5", old.replace(/\.mp4$/, ".jpg")]);
    index[t.key] = Math.round(total);
    rmSync(dir, { recursive: true, force: true });
    console.log(`✓ ${t.key} (${slides.length} steps, ${Math.round(total)}s${audio ? ", voice" : ", silent"})`);
  }
  writeFileSync(INDEX, JSON.stringify(index, null, 1));
  await browser.close();
  if (report.length) console.log(`\nCheck these:\n${report.join("\n")}`);
}

if (!process.env.TUT_TEST) main().catch((e) => { console.error(e); process.exit(1); });
export { targetsFor };
