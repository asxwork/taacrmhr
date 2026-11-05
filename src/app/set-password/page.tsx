import Link from "@/components/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { findPasswordToken } from "@/lib/invites";
import { setPassword } from "./actions";

export const metadata = { title: "Set your password", referrer: "no-referrer" as const };

/** Public page opened from the welcome email. The one-time token in the link is what authorises it. */
export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const row = await findPasswordToken(token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-12">
      <div className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-blue.svg" alt="The Advisor Associates" className="only-light mx-auto mb-10 h-16 w-auto" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-gold.svg" alt="" className="only-dark mx-auto mb-10 h-16 w-auto" />
        {row ? (
          <>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Welcome, {row.user.name.split(" ")[0]}</h1>
            <p className="mb-8 mt-1.5 text-sm text-muted">Choose a password for {row.user.email}.</p>
            <ActionForm action={setPassword} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <Field label="New password" hint="At least 8 characters.">
                <input name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus className="input" />
              </Field>
              <Field label="Repeat password">
                <input name="confirm" type="password" autoComplete="new-password" required minLength={8} className="input" />
              </Field>
              <SubmitButton className="h-11 w-full" pendingText="Saving…">Set password</SubmitButton>
            </ActionForm>
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl font-semibold tracking-tight">This link isn&apos;t valid</h1>
            <p className="mb-6 mt-1.5 text-sm text-muted">It has expired or was already used. Ask your administrator to send a new one.</p>
            <Link href="/login" className="text-sm font-medium text-navy-900 hover:underline">Go to sign in</Link>
          </>
        )}
      </div>
    </main>
  );
}
