import { ACCENTS, THEMES, WALLPAPERS, type Appearance } from "@/lib/appearance";
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
  values: { theme: string | null; accent: string | null; wallpaper: string | null };
  inherit?: Appearance;
}) {
  const upload = values.wallpaper?.startsWith("upload:") ? values.wallpaper.slice(7) : null;
  const tile = "peer-checked:ring-2 peer-checked:ring-navy-900 peer-checked:ring-offset-2 peer-focus-visible:ring-2 peer-focus-visible:ring-navy-700";

  return (
    <ActionForm action={action} className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-ink/80">Theme</legend>
        <div className="flex flex-wrap gap-2">
          {inherit && <Choice name="theme" value="default" checked={!values.theme} label={`Company (${THEMES.find((t) => t.value === inherit.theme)?.label})`} />}
          {THEMES.map((t) => (
            <Choice key={t.value} name="theme" value={t.value} checked={values.theme === t.value} label={t.label} />
          ))}
        </div>
      </fieldset>

      <fieldset>
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

      <fieldset>
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
