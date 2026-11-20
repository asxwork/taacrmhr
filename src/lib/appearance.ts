// Client-safe appearance options. Accent palettes remap the --color-navy-* tokens used across the app.

/** Themes with what their preview shows: page background, cards, text. */
export const THEMES = [
  { value: "light", label: "Light", canvas: "#f6f7f9", card: "#ffffff", text: "#0f1a2a" },
  { value: "soft", label: "Soft grey", canvas: "#e3e8ee", card: "#ffffff", text: "#0f1a2a" },
  { value: "sand", label: "Sand", canvas: "#efe8dc", card: "#fffdf8", text: "#2a2117" },
  { value: "contrast", label: "Night & Day", canvas: "#0e1a2b", card: "#ffffff", text: "#0f1a2a" },
  { value: "dark", label: "Dark", canvas: "#0b1420", card: "#121d2b", text: "#e6ebf2" },
  { value: "system", label: "Match device", canvas: "linear-gradient(90deg,#f6f7f9 50%,#0b1420 50%)", card: "#ffffff", text: "#0f1a2a" },
] as const;

export const DENSITIES = [
  { value: "comfortable", label: "Comfortable", hint: "Roomy, easy to read" },
  { value: "compact", label: "Compact", hint: "Smaller text and spacing: more on screen" },
] as const;

export const ACCENTS = [
  { value: "navy", label: "Navy", shades: ["#06111d", "#0a223c", "#12304f", "#1c3f63"] },
  { value: "midnight", label: "Midnight", shades: ["#020617", "#0f172a", "#1e293b", "#334155"] },
  { value: "royal", label: "Royal", shades: ["#0b1437", "#1e3a8a", "#1d4ed8", "#2563eb"] },
  { value: "emerald", label: "Emerald", shades: ["#022c22", "#064e3b", "#065f46", "#047857"] },
  { value: "maroon", label: "Maroon", shades: ["#2a0a10", "#5b1220", "#7a1a2c", "#9b2338"] },
  { value: "charcoal", label: "Charcoal", shades: ["#0b0b0f", "#18181b", "#27272a", "#3f3f46"] },
  { value: "teal", label: "Teal", shades: ["#042f2e", "#134e4a", "#115e59", "#0f766e"] },
  { value: "plum", label: "Plum", shades: ["#1e0b2e", "#3b0764", "#581c87", "#6b21a8"] },
  { value: "ocean", label: "Ocean", shades: ["#05202e", "#0c4a6e", "#075985", "#0369a1"] },
  { value: "copper", label: "Copper", shades: ["#2a1308", "#5c2c0f", "#7c3a12", "#9a4a18"] },
] as const;

/** Preset wallpapers are pure CSS so they cost nothing to load. Uploaded ones are stored as "upload:<path>". */
export const WALLPAPERS = [
  { value: "none", label: "None", css: "none" },
  { value: "dawn", label: "Dawn", css: "linear-gradient(135deg, #fdf6e3 0%, #f5e1b8 45%, #e8eef6 100%)" },
  { value: "harbour", label: "Harbour", css: "linear-gradient(160deg, #0a223c 0%, #1c3f63 55%, #b8894a 140%)" },
  { value: "mist", label: "Mist", css: "radial-gradient(circle at 20% 20%, #e0e7ff 0, transparent 40%), radial-gradient(circle at 80% 0%, #fde68a 0, transparent 35%), linear-gradient(180deg, #f8fafc, #eef2f7)" },
  { value: "skyline", label: "Skyline", css: "linear-gradient(0deg, rgba(10,34,60,.06) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(10,34,60,.06) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(180deg, #eef3f8, #f8fafc)" },
  { value: "gold", label: "Gold leaf", css: "linear-gradient(120deg, #f7fecf 0%, #f9c877 50%, #8c6a45 120%)" },
  { value: "night", label: "Night", css: "radial-gradient(circle at 70% 10%, #1c3f63 0, transparent 45%), linear-gradient(180deg, #06111d, #0a223c)" },
] as const;

export type Appearance = { theme: string; accent: string; wallpaper: string; density: string };
export const DEFAULT_APPEARANCE: Appearance = { theme: "light", accent: "navy", wallpaper: "none", density: "comfortable" };

export function wallpaperCss(value: string, fileUrl: (p: string) => string) {
  if (value.startsWith("upload:")) return `url("${fileUrl(value.slice(7))}") center / cover no-repeat`;
  return WALLPAPERS.find((w) => w.value === value)?.css ?? "none";
}

/** Inline CSS variables for <html>: accent palette + wallpaper. */
export function appearanceStyle(a: Appearance, fileUrl: (p: string) => string): Record<string, string> {
  const accent = ACCENTS.find((x) => x.value === a.accent) ?? ACCENTS[0];
  const [c950, c900, c800, c700] = accent.shades;
  return {
    "--color-navy-950": c950,
    "--color-navy-900": c900,
    "--color-navy-800": c800,
    "--color-navy-700": c700,
    "--wallpaper": wallpaperCss(a.wallpaper, fileUrl),
  };
}
