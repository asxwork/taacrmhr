import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { login } from "./actions";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ idle?: string }> }) {
  if (await getCurrentUser()) redirect("/home");
  const reason = (await searchParams).idle ? "You were signed out after a period of inactivity." : null;

  return (
    <main className="grid grid-cols-1 min-h-screen bg-surface lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel (desktop) */}
      <section className="relative hidden overflow-hidden bg-navy-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:40px_40px]" />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-gold-400/10 blur-3xl" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-gold.svg" alt="The Advisor Associates" className="relative h-16 w-auto self-start" />
        <div className="relative max-w-md">
          <p className="font-display text-4xl font-semibold leading-tight text-white">Every client, deal and team member — in one place.</p>
          <p className="mt-4 text-white/60">Leads, deals and inventory alongside attendance, leave and payroll for Bahadurabad and DHA.</p>
        </div>
        <p className="relative text-xs uppercase tracking-[0.2em] text-gold-300/80">Pakistan · UAE · KSA</p>
      </section>

      {/* Sign-in form */}
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-blue.svg" alt="The Advisor Associates" className="only-light mx-auto mb-10 h-16 w-auto lg:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-gold.svg" alt="" className="only-dark mx-auto mb-10 h-16 w-auto lg:hidden" />
          <h1 className="font-display text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mb-8 mt-1.5 text-sm text-muted">Sign in with your work email.</p>
          {reason && <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{reason}</p>}
          <LoginForm action={login} />
          <p className="mt-10 text-center text-xs text-muted">Forgot your password? Ask your administrator to reset it.</p>
        </div>
      </section>
    </main>
  );
}
