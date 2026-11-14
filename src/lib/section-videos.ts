// Short how-to videos, one per tutorial: public/tutorials/sections/<key>.mp4, listed in index.json ({ key: seconds }).
import { readFile } from "node:fs/promises";
import path from "node:path";

let cache: { at: number; map: Record<string, number> } | null = null;
export async function sectionVideos(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.map;
  let map: Record<string, number> = {};
  try { map = JSON.parse(await readFile(path.join(process.cwd(), "public", "tutorials", "sections", "index.json"), "utf8")); } catch {}
  cache = { at: Date.now(), map };
  return map;
}
export const videoUrl = (key: string) => `/tutorials/sections/${key}.mp4`;
