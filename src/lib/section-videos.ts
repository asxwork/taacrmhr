// Short how-to videos, one per tutorial: public/tutorials/sections/<key>.mp4, listed in index.json ({ key: seconds }).
// Each link carries the file's version (?v=…): browsers keep these files for a week, and a remade video must not be
// mixed with pieces of the old one they still have.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), "public", "tutorials", "sections");
let cache: { at: number; map: Record<string, number>; ver: Record<string, string> } | null = null;

async function load() {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache;
  let map: Record<string, number> = {};
  try { map = JSON.parse(await readFile(path.join(DIR, "index.json"), "utf8")); } catch {}
  const ver: Record<string, string> = {};
  await Promise.all(Object.keys(map).map(async (k) => { const s = await stat(path.join(DIR, `${k}.mp4`)).catch(() => null); if (s) ver[k] = Math.round(s.mtimeMs / 1000).toString(36); }));
  cache = { at: Date.now(), map, ver };
  return cache;
}

export async function sectionVideos(): Promise<Record<string, number>> {
  return (await load()).map;
}
/** key → version of its video, for the links below. */
export async function videoVersions(): Promise<Record<string, string>> {
  return (await load()).ver;
}
export const videoUrl = (key: string, v?: string) => `/tutorials/sections/${key}.mp4${v ? `?v=${v}` : ""}`;
export const posterUrl = (key: string, v?: string) => `/tutorials/sections/${key}.jpg${v ? `?v=${v}` : ""}`;
