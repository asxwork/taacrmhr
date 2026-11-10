import Link from "next/link";

/** Shell for the public legal pages (privacy, terms): no login needed, linked from Google's consent screen. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-canvas px-4 py-10">
      <article className="mx-auto max-w-2xl rounded-2xl bg-surface p-6 shadow-sm sm:p-10">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/brand/logo-blue.svg" alt="The Advisor Associates" className="mb-8 h-12" />
        <h1 className="font-display text-3xl font-semibold">{title}</h1>
        <p className="mb-8 mt-1 text-sm text-muted">Last updated {updated}</p>
        <div className="space-y-4 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">{children}</div>
        <p className="mt-10 border-t border-line pt-4 text-xs text-muted"><Link href="/privacy" className="hover:underline">Privacy policy</Link> · <Link href="/terms" className="hover:underline">Terms of service</Link> · <Link href="/login" className="hover:underline">Sign in</Link></p>
      </article>
    </main>
  );
}
