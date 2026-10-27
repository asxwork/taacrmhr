import { headers } from "next/headers";
import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { INTAKE_KEYS, getSetting, newSecret, setSetting } from "@/lib/lead-intake";
import { smtpConfigured } from "@/lib/mail";
import { fmtDateTime } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { createConnection, regenerateSecret, saveAssignees, sendTestEmail, updateConnection } from "./actions";

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
  const origin = process.env.APP_URL?.replace(/\/+$/, "") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const assigneeIds = ((await getSetting(INTAKE_KEYS.assignees)) ?? "").split(",").filter(Boolean);
  const [users, hooks, emails, connections, sources] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, title: true }, orderBy: { name: "asc" } }),
    db.webhookLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    db.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    db.apiConnection.findMany({ orderBy: { createdAt: "asc" } }),
    db.leadSource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  const apiUrl = `${origin}/api/v1/leads`;
  const sample = JSON.stringify({ name: "Ali Khan", phone: "0301 2345678", email: "ali@example.com", message: "Interested in a 10 marla plot", location: "DHA Phase 6", budget: "2.5 crore", campaign: "October listing" }, null, 2);
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
      <PageHeader title="Integrations" description="Email, lead API connections (Zameen, Zapier, Make, websites…), website lead capture and Facebook / Instagram Lead Ads." />
      <div className="space-y-6">
        <Card id="email" className="scroll-mt-20 p-5">
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
          <p className="mb-3 text-sm text-muted">Website, Facebook and API leads (connections without their own agents) are shared out one by one (round-robin) across the people ticked below. Repeat enquiries go to the existing lead’s owner.</p>
          <ActionForm action={saveAssignees}>
            <fieldset disabled={!editable} className="min-w-0 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
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
          <SectionTitle title="API connections" ok={connections.some((c) => c.active)} okText={`${connections.filter((c) => c.active).length} active`} notText="None yet" />
          <p className="mb-4 text-sm text-muted">
            Give every outside system its own key: a portal, an ad tool, Zapier or Make, another website. Leads arrive in New Request with that
            connection&apos;s source and are shared across its agents (or the main rotation). Turn one off or rotate its key without touching the others.
          </p>
          {connections.length > 0 && (
            <ul className="mb-4 divide-y divide-line rounded-xl border border-line">
              {connections.map((c) => (
                <li key={c.id} className="space-y-3 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{c.name}</span>
                    <Badge tone={c.active ? "green" : "neutral"}>{c.active ? "Active" : "Off"}</Badge>
                    <span className="text-xs text-muted">key …{c.keyHint} · {c.leadCount} lead(s){c.lastUsedAt ? ` · last ${fmtDateTime(c.lastUsedAt)}` : " · never used"}</span>
                  </div>
                  {editable && (
                    <div className="flex flex-wrap items-start gap-2">
                      <ActionForm action={updateConnection} className="flex flex-1 flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <input name="name" defaultValue={c.name} className="input h-9 w-40" aria-label="Name" />
                        <select name="sourceId" defaultValue={c.sourceId ?? ""} className="input h-9 w-40" aria-label="Lead source">
                          <option value="">Source: from payload</option>
                          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <details className="relative">
                          <summary className="flex h-9 cursor-pointer list-none items-center rounded-lg border border-line px-3 text-sm [&::-webkit-details-marker]:hidden">
                            Agents: {(c.assigneeIds ?? "").split(",").filter(Boolean).length || "main rotation"}
                          </summary>
                          <div className="absolute z-20 mt-1 grid max-h-64 w-64 gap-1 overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-xl">
                            {users.map((u) => (
                              <label key={u.id} className="flex items-center gap-2 text-sm">
                                <input type="checkbox" name="assignees" value={u.id} defaultChecked={(c.assigneeIds ?? "").split(",").includes(u.id)} className="accent-navy-900" /> {u.name}
                              </label>
                            ))}
                          </div>
                        </details>
                        <SubmitButton variant="secondary" className="h-9">Save</SubmitButton>
                      </ActionForm>
                      {(["rotate", "toggle", "delete"] as const).map((op) => (
                        <ActionForm key={op} action={updateConnection}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="op" value={op} />
                          <SubmitButton variant={op === "delete" ? "danger" : "secondary"} className="h-9">{op === "rotate" ? "New key" : op === "toggle" ? (c.active ? "Turn off" : "Turn on") : "Delete"}</SubmitButton>
                        </ActionForm>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {editable && (
            <ActionForm action={createConnection} className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas/60 p-3">
              <input name="name" required placeholder="Name, e.g. Zameen, Zapier, Website 2" className="input h-9 w-64" />
              <select name="sourceId" defaultValue="" className="input h-9 w-44" aria-label="Lead source">
                <option value="">Source: from payload</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <SubmitButton className="h-9">Add connection</SubmitButton>
            </ActionForm>
          )}

          <details className="mt-4 rounded-xl border border-line p-3 text-sm">
            <summary className="cursor-pointer font-medium">How to connect (Zameen, Facebook, Google Forms, any website)</summary>
            <div className="mt-3 space-y-3 text-muted">
              <Secret label="Endpoint" value={apiUrl} />
              <p>Send a <b className="font-medium text-ink">POST</b> with the header <code className="rounded bg-canvas px-1 text-xs">Authorization: Bearer YOUR_KEY</code> (or <code className="rounded bg-canvas px-1 text-xs">X-Api-Key</code>). One lead, a list, or <code className="rounded bg-canvas px-1 text-xs">{"{ \"leads\": [...] }"}</code>, up to 100 at a time. Phone or email is required; a repeat phone/email is added to the existing open lead instead of creating a duplicate.</p>
              <p>Field names are flexible: <span className="text-ink">name / full_name / first_name + last_name, phone / mobile / whatsapp, email, message / comments, location / area / city, property_type, budget / price, campaign, source, interest</span> (buy, rent, invest, sell).</p>
              <pre className="max-h-64 overflow-auto rounded-lg bg-navy-950 p-4 text-xs leading-relaxed text-white/85">{`curl -X POST ${apiUrl} \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${sample.replace(/\n\s*/g, " ")}'`}</pre>
              <ul className="list-disc space-y-1.5 pl-5">
                <li><b className="font-medium text-ink">Zapier or Make (easiest):</b> trigger on the other app (Facebook Lead Ads, Google Forms, Typeform, a new Gmail message…), then a <i>Webhooks → POST</i> action to the endpoint with your key. Use GET on the same URL with the key to test the connection.</li>
                <li><b className="font-medium text-ink">Zameen, Graana, OLX:</b> these portals don&apos;t push leads to other systems; they e-mail each enquiry. Forward those e-mails to a Zapier <i>Email Parser</i> or Make <i>mailhook</i> address, map name/phone/message, and POST them here. Their exported spreadsheets can also go in through Leads → Import.</li>
                <li><b className="font-medium text-ink">Your developer or another CRM:</b> give them the endpoint, a key from its own connection and this page.</li>
              </ul>
            </div>
          </details>
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
            <LogList rows={hooks.map((h) => ({ id: h.id, status: h.status, text: `${h.source === "facebook" ? "Facebook" : h.source.startsWith("api:") ? h.source.slice(4) : "Website"} · ${h.summary}`, at: h.createdAt, href: h.leadId ? `/crm/leads/${h.leadId}` : undefined }))} />
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
          <button title="Generate a new one (the old one stops working)" aria-label="Generate a new one (the old one stops working)" className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink"><RefreshCw className="size-4" /></button>
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
