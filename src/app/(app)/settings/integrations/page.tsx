import { headers } from "next/headers";
import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { INTAKE_KEYS, getSetting, newSecret, setSetting } from "@/lib/lead-intake";
import { smtpConfigured } from "@/lib/mail";
import { fmtDateTime } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { regenerateSecret, saveAssignees, sendTestEmail } from "./actions";

export const metadata = { title: "Integrations" };

const TONE = { created: "green", merged: "navy", ignored: "neutral", error: "red", sent: "green", failed: "red", skipped: "amber" } as const;

export default async function IntegrationsPage() {
  const user = await requirePermission("settings.company");
  const editable = can(user, "settings.company", "edit");

  // Create secrets on first visit so the page always has something to copy.
  let formKey = await getSetting(INTAKE_KEYS.webformKey);
  let fbToken = await getSetting(INTAKE_KEYS.facebookVerify);
  if (!formKey) await setSetting(INTAKE_KEYS.webformKey, (formKey = newSecret()));
  if (!fbToken) await setSetting(INTAKE_KEYS.facebookVerify, (fbToken = newSecret()));

  const h = await headers();
  const origin = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const assigneeIds = ((await getSetting(INTAKE_KEYS.assignees)) ?? "").split(",").filter(Boolean);
  const [users, hooks, emails] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, title: true }, orderBy: { name: "asc" } }),
    db.webhookLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    db.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const smtp = smtpConfigured();
  const fbReady = !!(process.env.FB_APP_SECRET && process.env.FB_PAGE_TOKEN);

  const snippet = `<form action="${origin}/api/webhooks/lead" method="POST">
  <input type="hidden" name="_key" value="${formKey}">
  <input type="hidden" name="_redirect" value="https://your-website.com/thank-you">
  <input type="hidden" name="source" value="Website">
  <input name="name" placeholder="Your name" required>
  <input name="phone" placeholder="Phone" required>
  <input name="email" type="email" placeholder="Email">
  <textarea name="message" placeholder="What are you looking for?"></textarea>
  <input name="website" style="display:none" tabindex="-1" autocomplete="off">
  <button type="submit">Send</button>
</form>`;

  return (
    <>
      <PageHeader title="Integrations" description="Email, website lead capture and Facebook / Instagram Lead Ads." />
      <div className="space-y-6">
        <Card className="p-5">
          <SectionTitle title="Outgoing email" ok={smtp} okText="Connected" notText="Not configured" />
          {smtp ? (
            <p className="text-sm text-muted">Sending as <b className="font-medium text-ink">{process.env.SMTP_FROM ?? process.env.SMTP_USER}</b> via {process.env.SMTP_HOST}.</p>
          ) : (
            <p className="text-sm text-muted">
              Add these to the server environment (Hostinger → your Node.js app → Environment variables), then restart:{" "}
              <code className="rounded bg-canvas px-1 text-xs">SMTP_HOST=smtp.hostinger.com</code> <code className="rounded bg-canvas px-1 text-xs">SMTP_PORT=465</code>{" "}
              <code className="rounded bg-canvas px-1 text-xs">SMTP_USER</code> <code className="rounded bg-canvas px-1 text-xs">SMTP_PASS</code>{" "}
              <code className="rounded bg-canvas px-1 text-xs">SMTP_FROM=&quot;The Advisor Associates &lt;crm@yourdomain.com&gt;&quot;</code>. Until then, emails are logged but not sent.
            </p>
          )}
          {editable && (
            <ActionForm action={sendTestEmail} className="mt-3">
              <SubmitButton variant="secondary" pendingText="Sending…">Send me a test email</SubmitButton>
            </ActionForm>
          )}
          {emails.length > 0 && <LogList rows={emails.map((e) => ({ id: e.id, status: e.status, text: `${e.subject} → ${e.to}${e.error ? ` (${e.error})` : ""}`, at: e.createdAt }))} />}
        </Card>

        <Card className="p-5">
          <SectionTitle title="Who gets new leads" ok={assigneeIds.length > 0} okText={`${assigneeIds.length} in rotation`} notText="Super Admin only" />
          <p className="mb-3 text-sm text-muted">Website and Facebook leads are shared out one by one (round-robin) across the people ticked below. Repeat enquiries go to the existing lead’s owner.</p>
          <ActionForm action={saveAssignees}>
            <fieldset disabled={!editable} className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
                  <input type="checkbox" name="assignees" value={u.id} defaultChecked={assigneeIds.includes(u.id)} className="accent-navy-900" />
                  <span>{u.name}{u.title && <span className="text-muted"> · {u.title}</span>}</span>
                </label>
              ))}
            </fieldset>
            {editable && <SubmitButton className="mt-3">Save rotation</SubmitButton>}
          </ActionForm>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Website form" ok okText="Ready" notText="" />
          <p className="mb-3 text-sm text-muted">Paste this form into your website, or POST JSON to the same URL with an <code className="rounded bg-canvas px-1 text-xs">X-Api-Key</code> header.</p>
          <Secret label="Endpoint" value={`${origin}/api/webhooks/lead`} />
          <Secret label="API key" value={formKey} regen={editable ? "webform" : undefined} />
          <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-navy-950 p-4 text-xs leading-relaxed text-white/85">{snippet}</pre>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Facebook & Instagram Lead Ads" ok={fbReady} okText="Connected" notText="Needs setup" />
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>In your Meta app, open <b className="font-medium text-ink">Webhooks → Page</b>, subscribe to <b className="font-medium text-ink">leadgen</b>.</li>
            <li>Use the callback URL and verify token below.</li>
            <li>Set <code className="rounded bg-canvas px-1 text-xs">FB_APP_SECRET</code> and a page token with <i>leads_retrieval</i> as <code className="rounded bg-canvas px-1 text-xs">FB_PAGE_TOKEN</code> on the server{fbReady ? " ✓" : ""}.</li>
          </ol>
          <Secret label="Callback URL" value={`${origin}/api/webhooks/facebook`} />
          <Secret label="Verify token" value={fbToken} regen={editable ? "facebook" : undefined} />
          <p className="mt-2 text-xs text-muted">Meta requires a public HTTPS address, so this works once the app is live on Hostinger.</p>
        </Card>

        <Card className="p-5">
          <h2 className="mb-2 font-medium">Recent incoming leads</h2>
          {hooks.length === 0 ? <p className="text-sm text-muted">Nothing received yet.</p> : (
            <LogList rows={hooks.map((h) => ({ id: h.id, status: h.status, text: `${h.source === "facebook" ? "Facebook" : "Website"} · ${h.summary}`, at: h.createdAt, href: h.leadId ? `/crm/leads/${h.leadId}` : undefined }))} />
          )}
        </Card>
      </div>
    </>
  );
}

function SectionTitle({ title, ok, okText, notText }: { title: string; ok: boolean; okText: string; notText: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h2 className="font-medium">{title}</h2>
      {ok ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="size-3.5" /> {okText}</span>
        : <span className="inline-flex items-center gap-1 text-xs text-amber-700"><CircleAlert className="size-3.5" /> {notText}</span>}
    </div>
  );
}

function Secret({ label, value, regen }: { label: string; value: string; regen?: "webform" | "facebook" }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="w-28 shrink-0 text-muted">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-canvas px-2.5 py-1.5 text-xs">{value}</code>
      {regen && (
        <form action={regenerateSecret}>
          <input type="hidden" name="which" value={regen} />
          <button title="Generate a new one (the old one stops working)" className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink"><RefreshCw className="size-4" /></button>
        </form>
      )}
    </div>
  );
}

function LogList({ rows }: { rows: { id: string; status: string; text: string; at: Date; href?: string }[] }) {
  return (
    <ul className="mt-3 divide-y divide-line text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-3 py-2">
          <Badge tone={TONE[r.status as keyof typeof TONE] ?? "neutral"}>{r.status}</Badge>
          {r.href ? <a href={r.href} className="min-w-0 flex-1 truncate hover:underline">{r.text}</a> : <span className="min-w-0 flex-1 truncate">{r.text}</span>}
          <span className="shrink-0 text-xs text-muted">{fmtDateTime(r.at)}</span>
        </li>
      ))}
    </ul>
  );
}
