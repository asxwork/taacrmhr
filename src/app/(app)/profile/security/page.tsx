import { ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { openSecret } from "@/lib/softphone";
import { otpauthUrl } from "@/lib/totp";
import { securitySettings, twoStepRequired } from "@/lib/security";
import { can } from "@/lib/permissions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { confirmTotp, disableTotp, newBackupCodes, startTotp } from "./actions";

export const metadata = { title: "Two-step login" };

/** My profile → Two-step login: set up an authenticator app (Google / Microsoft Authenticator). */
export default async function TwoStepPage() {
  const user = await requireUser();
  const [row, s] = await Promise.all([db.user.findUnique({ where: { id: user.id }, select: { email: true, totpSecret: true, totpEnabled: true, totpRecovery: true } }), securitySettings()]);
  const required = twoStepRequired(user, s, can(user, "finance") || can(user, "finance.boss"));
  const backup = row?.totpEnabled ? (openSecret(row.totpRecovery ?? null) ?? "").split(",").filter(Boolean) : [];
  const pending = !row?.totpEnabled && row?.totpSecret ? openSecret(row.totpSecret) : null;
  const key = pending?.match(/.{1,4}/g)?.join(" ");
  return (
    <>
      <PageHeader title="Two-step login" description="After your password, AMS asks for a 6-digit code from an app on your phone, so a stolen password alone can't get in." />
      {required && !row?.totpEnabled && <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Your company requires two-step login. Set it up below to continue using AMS.</p>}
      <Card className="max-w-2xl p-6">
        <div className="mb-5 flex items-center gap-3">
          <ShieldCheck className="size-6 text-navy-900" />
          <p className="flex-1 font-medium">Status</p>
          {row?.totpEnabled ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}
        </div>
        {row?.totpEnabled ? (
          !required ? (
            <ActionForm action={disableTotp} className="flex flex-wrap items-end gap-3">
              <Field label="Current code (to turn off)"><input name="code" inputMode="numeric" maxLength={7} required className="input w-40 font-mono tracking-widest" /></Field>
              <SubmitButton variant="secondary">Turn off</SubmitButton>
            </ActionForm>
          ) : <p className="text-sm text-muted">Required by company policy, so it can’t be turned off.</p>
        ) : pending ? (
          <ol className="list-decimal space-y-4 pl-5 text-sm">
            <li>Install <b>Google Authenticator</b> or <b>Microsoft Authenticator</b> on your phone.</li>
            <li>
              In the app tap <b>+</b> → <b>Enter a setup key</b>. Account: <span className="font-mono">AMS ({row?.email})</span>, key:
              <p className="mt-2 select-all rounded-lg bg-canvas px-3 py-2 text-center font-mono text-base tracking-wider">{key}</p>
              <p className="mt-1 text-xs text-muted">On this phone? <a href={otpauthUrl(pending, row!.email)} className="underline">Open in the authenticator app</a>. Time based, 6 digits.</p>
            </li>
            <li>
              Type the 6-digit code the app shows:
              <ActionForm action={confirmTotp} className="mt-2 flex flex-wrap items-end gap-3">
                <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus className="input w-40 text-center font-mono text-lg tracking-[0.3em]" placeholder="123456" aria-label="Code" />
                <SubmitButton>Turn on</SubmitButton>
              </ActionForm>
            </li>
          </ol>
        ) : (
          <ActionForm action={startTotp}><SubmitButton>Set up two-step login</SubmitButton></ActionForm>
        )}
      </Card>
      {row?.totpEnabled && (
        <Card className="mt-6 max-w-2xl p-6">
          <p className="font-medium">Backup codes</p>
          <p className="mt-1 text-sm text-muted">Lost your phone? Type one of these instead of the 6-digit code. Each works once. Write them down or save them somewhere safe, not on the same phone.</p>
          {backup.length > 0 ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-navy-900">Show my {backup.length} backup codes</summary>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">{backup.map((c) => <code key={c} className="select-all rounded-md bg-canvas px-2 py-1.5 text-center font-mono text-sm">{c}</code>)}</div>
            </details>
          ) : <p className="mt-3 text-sm text-amber-700">You have no backup codes left. Make new ones.</p>}
          <ActionForm action={newBackupCodes} className="mt-4"><SubmitButton variant="secondary">Make new backup codes</SubmitButton></ActionForm>
        </Card>
      )}
    </>
  );
}
