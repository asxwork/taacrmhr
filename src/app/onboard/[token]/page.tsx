import { CheckCircle2, Clock, PartyPopper, TriangleAlert } from "lucide-react";
import { db } from "@/lib/db";
import { disabledFeatures } from "@/lib/features";
import { ONB_FIELDS, ONB_SECTIONS, onbStatus } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { submitOnboarding } from "./actions";

export const metadata = { title: "Welcome: your details" };

const fileCls = "block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white";

/** Public onboarding form opened from the link HR sends a new hire. */
export default async function OnboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = (await disabledFeatures()).has("onboarding") ? null : await db.onboardingInvite.findUnique({ where: { token }, include: { employee: { select: { firstName: true, lastName: true, fullName: true, phone: true, personalEmail: true } } } });
  const st = inv ? onbStatus(inv) : null;
  const expired = !inv || inv.expiresAt < new Date();
  const e = inv?.employee;
  const saved = (inv?.payload ? JSON.parse(inv.payload) : {}) as Record<string, string>;
  const wrong = new Set((inv?.wrongFields ?? "").split(",").filter(Boolean));
  const value = (k: string) => saved[k] ?? (k === "firstName" ? e?.firstName ?? e?.fullName.split(" ")[0] : k === "lastName" ? e?.lastName ?? e?.fullName.split(" ").slice(1).join(" ") : k === "phone" ? e?.phone : k === "personalEmail" ? e?.personalEmail : k === "nationality" ? "Pakistani" : "") ?? "";

  const screen = (icon: React.ReactNode, title: string, text: string) => (
    <div className="rounded-2xl bg-surface p-10 text-center shadow-sm">
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-canvas">{icon}</div>
      <h1 className="mb-2 font-display text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );

  let body: React.ReactNode;
  if (st === "submitted") body = screen(<Clock className="size-8 text-amber-500" />, "Your info is submitted", "Thank you! HR is checking your details now. If anything needs fixing, HR will send you this same link again.");
  else if (st === "approved") body = screen(<PartyPopper className="size-8 text-emerald-600" />, "All done, welcome aboard!", "HR has approved your details. Nothing else to do here.");
  else if (expired || !inv) body = screen(<TriangleAlert className="size-8 text-red-500" />, "This link doesn't work", "It may have expired. Ask HR for a new one.");
  else body = (
    <div className="rounded-2xl bg-surface p-6 shadow-sm sm:p-8">
      <h1 className="font-display text-2xl font-semibold">Welcome{e?.firstName ? `, ${e.firstName}` : ""}!</h1>
      <p className="mb-5 text-sm text-muted">Please fill in your details for HR. It takes about 5 minutes. <b className="text-ink">Every field is required.</b></p>
      {st === "rejected" && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="size-4" /> HR asked you to fix a few things</p>
          {wrong.size > 0 && <p className="mt-1">Please check: <b>{ONB_FIELDS.filter((f) => wrong.has(f.key)).map((f) => f.label).join(", ")}</b> (marked in red below).</p>}
          {inv.reviewNote && <p className="mt-1">HR&apos;s note: “{inv.reviewNote}”</p>}
        </div>
      )}
      <ActionForm action={submitOnboarding} className="space-y-6">
        <input type="hidden" name="token" value={token} />
        {ONB_SECTIONS.map((sec) => (
          <fieldset key={sec} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{sec}</legend>
            {ONB_FIELDS.filter((f) => f.section === sec).map((f) => {
              const bad = wrong.has(f.key);
              const cls = cn("input", bad && "border-red-500 ring-2 ring-red-200");
              return (
                <label key={f.key} className="block text-sm">
                  <span className={cn("mb-1 block font-medium", bad && "text-red-700")}>{f.label} <span className="text-red-600">*</span>{bad && <span className="ml-1 text-xs font-normal">· please fix</span>}</span>
                  {f.kind === "select" ? (
                    <select name={f.key} required defaultValue={value(f.key)} className={cls}><option value="">Choose…</option>{f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  ) : f.kind === "file" ? (
                    <>
                      <input name={f.key} type="file" required={!saved[f.key] || bad} accept={f.key === "photo" ? "image/jpeg,image/png,image/webp" : "image/*,application/pdf"} capture={f.key === "photo" ? "user" : undefined} className={cn(fileCls, bad && "rounded-md ring-2 ring-red-200")} />
                      {saved[f.key] && !bad && <span className="mt-1 flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="size-3" /> Already uploaded; attach again only to replace it</span>}
                    </>
                  ) : (
                    <input name={f.key} type={f.kind} required defaultValue={value(f.key)} placeholder={f.ph} pattern={f.pattern} title={f.pattern ? `Format: ${f.ph}` : undefined} max={f.kind === "date" ? new Date().toISOString().slice(0, 10) : undefined} className={cls} />
                  )}
                </label>
              );
            })}
          </fieldset>
        ))}
        <SubmitButton pendingText="Sending…">{st === "rejected" ? "Send corrected details to HR" : "Submit to HR"}</SubmitButton>
      </ActionForm>
    </div>
  );

  return (
    <main className="min-h-screen bg-canvas px-4 py-8">
      <div className="mx-auto max-w-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/brand/logo-blue.svg" alt="The Advisor Associates" className="mx-auto mb-6 h-12" />
        {body}
      </div>
    </main>
  );
}
