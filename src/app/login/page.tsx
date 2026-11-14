import Link from "next/link";
import { redirect } from "next/navigation";
import { Briefcase, PhoneCall, ShieldCheck, Target, Wallet } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { login, requestPasswordReset } from "./actions";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

const APPS = [
  { icon: Target, name: "CRM", text: "Leads, deals, inventory", tone: "from-sky-500 to-blue-700" },
  { icon: Briefcase, name: "HR & payroll", text: "Attendance, leave, payslips", tone: "from-violet-500 to-fuchsia-700" },
  { icon: Wallet, name: "Finance", text: "Expenses with every bill", tone: "from-emerald-500 to-lime-700" },
  { icon: PhoneCall, name: "Calls", text: "Dialer, campaigns, recordings", tone: "from-rose-500 to-orange-600" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ idle?: string; password?: string }> }) {
  if (await getCurrentUser().catch(() => null)) redirect("/home");
  const sp = await searchParams;
  const reason = sp.idle ? "You were signed out after a period of inactivity." : null;
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Karachi" }).format(new Date()));
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

  return (
    <main className="grid min-h-screen grid-cols-1 bg-surface lg:grid-cols-[1.15fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-navy-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 size-[30rem] rounded-full bg-gold-400/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-sky-500/10 blur-3xl" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-gold.svg" alt="The Advisor Associates" className="relative h-16 w-auto self-start" />
        <div className="relative max-w-lg">
          <p className="text-sm font-medium uppercase tracking-[0.25em] text-gold-300/90">Advisor Management System</p>
          <p className="mt-3 font-display text-[2.6rem] font-semibold leading-[1.15] text-white">Every client, deal, rupee and team member, in one place.</p>
          <ul className="mt-10 grid grid-cols-2 gap-3">
            {APPS.map((a) => (
              <li key={a.name} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${a.tone} shadow-lg shadow-black/30`}><a.icon className="size-5 text-white" /></span>
                <span className="min-w-0"><span className="block text-sm font-medium text-white">{a.name}</span><span className="block truncate text-xs text-white/50">{a.text}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative flex items-center justify-between text-xs text-white/50">
          <span className="uppercase tracking-[0.2em] text-gold-300/80">Pakistan · UAE · KSA</span>
          <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Encrypted sign-in · two-step login available</span>
        </div>
      </section>

      {/* Sign-in */}
      <section className="relative flex items-center justify-center px-6 py-12">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-navy-950 to-transparent opacity-[0.06] lg:hidden" />
        <div className="relative w-full max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-blue.svg" alt="The Advisor Associates" className="only-light mx-auto mb-10 h-16 w-auto lg:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-gold.svg" alt="" className="only-dark mx-auto mb-10 h-16 w-auto lg:hidden" />
          <p className="text-sm font-medium text-gold-600">{greeting}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mb-8 mt-1.5 text-sm text-muted">Sign in with your work email to continue.</p>
          {reason && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{reason}</p>}
          {sp.password === "set" && <p role="status" className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Password set. You can sign in now.</p>}
          <LoginForm action={login} resetAction={requestPasswordReset} />
          <p className="mt-10 text-center text-xs text-muted">© {new Date().getFullYear()} The Advisor Associates · <Link href="/privacy" className="hover:underline">Privacy</Link> · <Link href="/terms" className="hover:underline">Terms</Link></p>
        </div>
      </section>
    </main>
  );
}
