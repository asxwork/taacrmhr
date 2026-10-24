import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { login } from "./actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-blue.svg" alt="The Advisor Associates" className="only-light mx-auto mb-10 h-20 w-auto" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-gold.svg" alt="" className="only-dark mx-auto mb-10 h-20 w-auto" />
        <ActionForm action={login} className="space-y-4">
          <Field label="Email">
            <input name="email" type="email" autoComplete="email" required autoFocus className="input" />
          </Field>
          <Field label="Password">
            <input name="password" type="password" autoComplete="current-password" required className="input" />
          </Field>
          <SubmitButton className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
        </ActionForm>
        <p className="mt-10 text-center text-xs text-muted">CRM &amp; HR Platform</p>
      </div>
    </main>
  );
}
