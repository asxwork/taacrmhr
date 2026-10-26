import { cache } from "react";
import { db } from "./db";
import { memo } from "./memo";
import { getCurrentUser } from "./auth";
import { ACCENTS, DEFAULT_APPEARANCE, THEMES, WALLPAPERS, type Appearance } from "./appearance";
import { saveImage } from "./files";

const KEYS = { theme: "appearance.theme", accent: "appearance.accent", wallpaper: "appearance.wallpaper" } as const;

// Read on every page; cached until a setting is written (db.ts clears "setting:").
export const getCompanyAppearance = cache(async (): Promise<Appearance> => {
  const rows = await memo("setting:appearance", 300_000, () => db.setting.findMany({ where: { key: { in: Object.values(KEYS) } } }));
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  return {
    theme: get(KEYS.theme) ?? DEFAULT_APPEARANCE.theme,
    accent: get(KEYS.accent) ?? DEFAULT_APPEARANCE.accent,
    wallpaper: get(KEYS.wallpaper) ?? DEFAULT_APPEARANCE.wallpaper,
  };
});

/** What the current viewer sees: their own choices, falling back to the company default. */
export const getAppearance = cache(async (): Promise<Appearance> => {
  const company = await getCompanyAppearance();
  const user = await getCurrentUser();
  if (!user) return company;
  const { prefs } = user;
  return {
    theme: prefs.theme ?? company.theme,
    accent: prefs.accent ?? company.accent,
    wallpaper: prefs.wallpaper ?? company.wallpaper,
  };
});

export const APPEARANCE_KEYS = KEYS;

/**
 * Reads theme/accent/wallpaper from a form. "default" → null (inherit the company setting) when allowed.
 * An uploaded wallpaper file wins over the preset choice.
 */
export async function readAppearanceForm(fd: FormData, uploadDir: string, allowDefault: boolean) {
  const pick = (key: string, allowed: readonly string[]) => {
    const v = fd.get(key);
    if (allowDefault && v === "default") return null;
    return typeof v === "string" && allowed.includes(v) ? v : undefined;
  };
  const theme = pick("theme", THEMES.map((t) => t.value));
  const accent = pick("accent", ACCENTS.map((a) => a.value));
  let wallpaper = pick("wallpaper", [...WALLPAPERS.map((w) => w.value), "keep"]);
  const file = fd.get("wallpaperFile");
  if (file instanceof File && file.size > 0) {
    const res = await saveImage(file, uploadDir, 8_000_000);
    if ("error" in res) return { error: res.error };
    wallpaper = `upload:${res.path}`;
  }
  return { theme, accent, wallpaper };
}
