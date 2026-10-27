import Link from "next/link";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";

export const metadata = { title: "Verify email" };

/** Public landing for the verification link from System Settings → Email Verification. */
export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  let ok = false;
  if (token) {
    const row = await db.emailToken.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
    if (row && row.expiresAt > new Date()) {
      await db.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
      await db.emailToken.deleteMany({ where: { userId: row.userId } });
      ok = true;
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="max-w-sm rounded-2xl bg-surface p-8 text-center shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/brand/logo-blue.svg" alt="The Advisor Associates" className="mx-auto mb-6 h-12" />
        <h1 className="mb-2 text-lg font-semibold">{ok ? "Email verified" : "This link doesn't work"}</h1>
        <p className="mb-6 text-sm text-muted">{ok ? "Thanks! Notifications and payslips will reach this address." : "It may have expired or been used already. Ask your administrator for a new one."}</p>
        <Link href="/login" className="inline-block rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white">Go to sign in</Link>
      </div>
    </main>
  );
}
