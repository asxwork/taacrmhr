// Sample property photos for the demo data: simple building illustrations drawn pixel by pixel and saved as PNG
// (no image library needed on the server). Each scene varies by seed: sky, building heights, colours, a plot.
import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { UPLOAD_ROOT } from "./files";

const W = 640;
const H = 400;
type RGB = [number, number, number];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function encodePng(px: Uint8Array) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    Buffer.from(px.buffer, px.byteOffset + y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const SKIES: [RGB, RGB][] = [[[104, 162, 222], [206, 230, 248]], [[246, 160, 96], [253, 222, 170]], [[40, 52, 96], [120, 120, 170]], [[140, 190, 230], [236, 244, 250]]];
const WALLS: RGB[] = [[232, 226, 214], [196, 204, 214], [214, 190, 160], [176, 186, 196], [240, 240, 236]];

/** Draws one scene; `kind` "plot" draws open land with boundary pegs instead of towers. */
function drawScene(seed: number, kind: "tower" | "plot") {
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const px = new Uint8Array(W * H * 3);
  const set = (x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
  };
  const rect = (x0: number, y0: number, w: number, h: number, c: RGB) => {
    for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) set(x, y, c);
  };
  const [top, bottom] = SKIES[seed % SKIES.length]!;
  const ground = kind === "plot" ? 250 : 330;
  for (let y = 0; y < ground; y++) {
    const t = y / ground;
    const c: RGB = [0, 1, 2].map((k) => Math.round(top[k]! + (bottom[k]! - top[k]!) * t)) as RGB;
    rect(0, y, W, 1, c);
  }
  // Sun
  const sx = 80 + Math.floor(rand() * 480), sy = 60 + Math.floor(rand() * 40);
  for (let y = -28; y <= 28; y++) for (let x = -28; x <= 28; x++) if (x * x + y * y <= 784) set(sx + x, sy + y, [255, 236, 170]);

  if (kind === "plot") {
    for (let y = ground; y < H; y++) rect(0, y, W, 1, [150 + ((y * 7) % 13), 120 + ((y * 5) % 9), 80]);
    rect(0, ground, W, 6, [96, 140, 70]);
    for (let i = 0; i < 6; i++) {
      const x = 90 + i * 92;
      rect(x, ground + 40 + (i % 2) * 30, 6, 28, [230, 230, 230]);
      rect(x, ground + 40 + (i % 2) * 30, 6, 6, [220, 60, 50]);
    }
    rect(60, ground + 120, 520, 4, [240, 240, 240]);
    return encodePng(px);
  }

  // Background skyline
  for (let x = 0; x < W; ) {
    const w = 30 + Math.floor(rand() * 50), h = 60 + Math.floor(rand() * 90);
    rect(x, ground - h, w, h, [150, 160, 176]);
    x += w + 4;
  }
  // Main towers with windows
  const towers = 2 + Math.floor(rand() * 2);
  for (let t = 0; t < towers; t++) {
    const w = 120 + Math.floor(rand() * 40), h = 170 + Math.floor(rand() * 110);
    const x0 = 40 + t * Math.floor((W - 80) / towers) + Math.floor(rand() * 20);
    const wall = WALLS[(seed + t) % WALLS.length]!;
    rect(x0, ground - h, w, h, wall);
    rect(x0 - 4, ground - h - 8, w + 8, 8, [90, 98, 110]);
    for (let y = ground - h + 14; y < ground - 30; y += 22) {
      for (let x = x0 + 10; x < x0 + w - 18; x += 22) {
        const lit = rand() > 0.75;
        rect(x, y, 14, 14, lit ? [255, 214, 120] : [70, 110, 150]);
      }
    }
    rect(x0 + w / 2 - 12, ground - 30, 24, 30, [60, 50, 40]);
  }
  // Ground, road, trees
  rect(0, ground, W, H - ground, [120, 170, 90]);
  rect(0, ground + 28, W, 26, [70, 74, 80]);
  for (let x = 10; x < W; x += 60) rect(x, ground + 40, 28, 3, [240, 240, 240]);
  for (let i = 0; i < 7; i++) {
    const x = 20 + i * 95;
    rect(x + 8, ground - 18, 6, 18, [100, 70, 40]);
    for (let y = -16; y <= 16; y++) for (let dx = -16; dx <= 16; dx++) if (dx * dx + y * y <= 256) set(x + 11 + dx, ground - 30 + y, [60, 130, 70]);
  }
  return encodePng(px);
}

/** Writes a sample photo under the uploads folder and returns its relative path (as stored on ProjectImage/UnitImage). */
export async function saveDemoPhoto(dir: string, seed: number, kind: "tower" | "plot" = "tower") {
  const rel = path.posix.join(dir, `${Date.now()}-${randomBytes(6).toString("hex")}.png`);
  const abs = path.join(UPLOAD_ROOT, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, drawScene(seed, kind));
  return rel;
}
