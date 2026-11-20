import { ACCENTS, DENSITIES, THEMES, WALLPAPERS, type Appearance } from "@/lib/appearance";
import { fileUrl } from "@/lib/files";
import type { FormState } from "@/lib/utils";
import { ActionForm, SubmitButton } from "./action-form";

/**
 * Theme, accent and wallpaper picker. With `inherit`, each choice can fall back to the company default
 * (values are null on the user when inheriting).
 */
export function AppearanceForm({
  action,
  values,
  inherit,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  values: { theme: string | null; accent: string | null; wallpaper: string | null; density?: string | null };
  inherit?: Appearance;
}) {
  const upload = values.wallpaper?.startsWith("upload:") ? values.wallpaper.slice(7) : null;
  const tile = "peer-checked:ring-2 peer-checked:ring-navy-900 peer-checked:ring-offset-2 peer-focus-visible:ring-2 peer-focus-visible:ring-navy-700";

  return (
    <ActionForm action={action} className="space-y-6">
      <fieldset className="min-w-0">
        <legend className="mb-2 text-xs font-medium text-ink/80">Theme</legend>
        {/* Each theme as a small preview: page background, the dark menu, and white (or dark) cards on it. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {inherit && (
            <label className="cursor-pointer">
              <input type="radio" name="theme" value="default" defaultChecked={!values.theme} className="peer sr-only" />
              <span className={`flex aspect-[16/10] items-center justify-center rounded-lg border border-dashed border-line text-center text-xs text-muted ${tile}`}>Company default<br />({THEMES.find((t) => t.value === inherit.theme)?.label})</span>
            </label>
          )}
          {THEMES.map((t) => (
            <label key={t.value} className="cursor-pointer">
              <input type="radio" name="theme" value={t.value} defaultChecked={values.theme === t.value} className="peer sr-only" />
              <span className={`flex aspect-[16/10] overflow-hidden rounded-lg border border-line ${tile}`} style={{ background: t.canvas }} aria-hidden>
                <span className="w-1/5" style={{ background: "#0a223c" }} />
                <span className="flex flex-1 flex-col gap-1 p-1.5">
                  <span className="h-1.5 w-2/5 rounded-full" style={{ background: t.value === "contrast" || t.value === "dark" ? "#e8edf4" : "#0f1a2a", opacity: 0.7 }} />
                  <span className="flex-1 rounded" style={{ background: t.card, boxShadow: "0 1px 2px rgba(0,0,0,.12)" }}>
                    <span className="m-1 block h-1 w-3/5 rounded-full" style={{ background: t.text, opacity: 0.5 }} />
                    <span className="m-1 block h-1 w-2/5 rounded-full" style={{ background: t.text, opacity: 0.3 }} />
                  </span>
                </span>
              </span>
              <span className="mt-1 block text-center text-xs font-medium">{t.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="mb-2 text-xs font-medium text-ink/80">Density</legend>
        <div className="flex flex-wrap gap-2">
          {inherit && <Choice name="density" value="default" checked={!values.density} label="Company" />}
          {DENSITIES.map((d) => (
            <label key={d.value} className="cursor-pointer">
              <input type="radio" name="density" value={d.value} defaultChecked={values.density === d.value || (!inherit && !values.density && d.value === "comfortable")} className="peer sr-only" />
              <span className="block rounded-lg border border-line px-3 py-2 text-sm peer-checked:border-navy-900 peer-checked:bg-navy-900 peer-checked:text-white">
                <span className="block font-medium">{d.label}</span><span className="block text-xs opacity-70">{d.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="mb-2 text-xs font-medium text-ink/80">Accent colour</legend>
        <div className="flex flex-wrap gap-3">
          {inherit && <Choice name="accent" value="default" checked={!values.accent} label="Company" />}
          {ACCENTS.map((a) => (
            <label key={a.value} className="cursor-pointer text-center">
              <input type="radio" name="accent" value={a.value} defaultChecked={values.accent === a.value} className="peer sr-only" />
              <span className={`block size-10 rounded-full ${tile}`} style={{ background: `linear-gradient(135deg, ${a.shades[0]}, ${a.shades[3]})` }} />
              <span className="mt-1 block text-[11px] text-muted">{a.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="mb-2 text-xs font-medium text-ink/80">Wallpaper</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {inherit && (
            <label className="cursor-pointer">
              <input type="radio" name="wallpaper" value="default" defaultChecked={!values.wallpaper} className="peer sr-only" />
              <span className={`flex aspect-video items-center justify-center rounded-lg border border-dashed border-line text-xs text-muted ${tile}`}>Company</span>
            </label>
          )}
          {upload && (
            <label className="cursor-pointer">
              <input type="radio" name="wallpaper" value="keep" defaultChecked className="peer sr-only" />
              <span className={`block aspect-video rounded-lg border border-line bg-cover bg-center ${tile}`} style={{ backgroundImage: `url("${fileUrl(upload)}")` }} />
              <span className="mt-1 block text-center text-[11px] text-muted">Your photo</span>
            </label>
          )}
          {WALLPAPERS.map((w) => (
            <label key={w.value} className="cursor-pointer">
              <input type="radio" name="wallpaper" value={w.value} defaultChecked={values.wallpaper === w.value} className="peer sr-only" />
              <span className={`block aspect-video rounded-lg border border-line ${tile}`} style={{ background: w.css === "none" ? "var(--color-canvas)" : w.css }} />
              <span className="mt-1 block text-center text-[11px] text-muted">{w.label}</span>
            </label>
          ))}
        </div>
        <label className="mt-3 block text-sm">
          <span className="text-xs text-muted">Or upload your own (JPG/PNG/WebP, up to 8 MB):</span>
          <input name="wallpaperFile" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" />
        </label>
      </fieldset>

      <SubmitButton>Save appearance</SubmitButton>
    </ActionForm>
  );
}

function Choice({ name, value, checked, label }: { name: string; value: string; checked: boolean; label: string }) {
  return (
    <label className="cursor-pointer">
      <input type="radio" name={name} value={value} defaultChecked={checked} className="peer sr-only" />
      <span className="block rounded-md border border-line px-3 py-1.5 text-sm text-muted peer-checked:border-navy-900 peer-checked:bg-navy-900 peer-checked:text-white">{label}</span>
    </label>
  );
}
