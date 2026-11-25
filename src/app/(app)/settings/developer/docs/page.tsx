import { redirect } from "next/navigation";
import Link from "@/components/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { APP_URL } from "@/lib/notify";
import { DEV_EVENTS, DEV_SCOPES, methodList } from "@/lib/dev-api";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "API reference" };

const code = "block overflow-x-auto whitespace-pre rounded-lg bg-navy-950 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-white/90";

/** Settings → Developer resources → API reference: every method with its exact parameters, generated from the code. */
export default async function ApiDocs() {
  const user = await requireUser();
  if (!(user.isSuperAdmin || can(user, "settings.company", "edit"))) redirect("/no-access");
  const base = APP_URL();
  const methods = methodList();
  return (
    <div className="max-w-4xl">
      <Link href="/settings/developer" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> Developer resources</Link>
      <PageHeader title="API reference" description="Every method an inbound webhook key (and the AI assistant) can call, with its exact parameters. Always up to date: it's made from the same code that answers the calls." />

      <Card className="mb-6 space-y-4 p-5 text-sm">
        <h2 className="font-semibold">Calling AMS</h2>
        <p>Two ways, same methods and answers. Options go in the query string or as a JSON (or form) body; GET and POST both work.</p>
        <p className="font-medium">1. Key in the link (like Bitrix)</p>
        <code className={code}>{`GET ${base}/api/rest/<key>/crm.lead.list?stage=New%20Request`}</code>
        <p className="font-medium">2. Key in a header (keeps the key out of server logs; recommended for your own code)</p>
        <code className={code}>{`curl -X POST ${base}/api/rest/crm.lead.add \\
  -H "Authorization: Bearer <key>" -H "Content-Type: application/json" \\
  -d '{"name":"Ali Khan","phone":"+92 300 1234567","source":"Website","notes":"3 bed in DHA"}'`}</code>
        <p className="font-medium">Answers</p>
        <code className={code}>{`{ "result": …, "total": 120, "next": 50, "time": { … } }      // lists: total and next page start
{ "error": "INVALID", "error_description": "name is required." }`}</code>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li><b className="text-ink">401 NO_AUTH</b>: unknown, renewed or switched-off key. <b className="text-ink">403 ACCESS_DENIED</b>: the key lacks the scope, or its owner lacks the permission in AMS.</li>
          <li><b className="text-ink">404 METHOD_NOT_FOUND</b> / <b className="text-ink">NOT_FOUND</b>: unknown method, or no such record you can open. <b className="text-ink">400 INVALID</b>: a missing or wrong option.</li>
          <li><b className="text-ink">429 QUERY_LIMIT_EXCEEDED</b>: more than 120 calls a minute on one key. Lists return 50 at a time: pass <code>start</code> = the <code>next</code> you got.</li>
          <li>Each key works with the permissions of the person who made it, only within its scopes ({DEV_SCOPES.map((s) => s.key).join(", ")}). Call <code>methods</code> to get this list for a key as JSON.</li>
        </ul>
        <p className="font-medium">Scripts written for Bitrix24</p>
        <p className="text-muted">Change only the link: AMS understands Bitrix&apos;s shapes for <code>crm.lead.add</code> (<code>fields[…]</code>, answers <code>{`{"result": <lead number>}`}</code>), <code>user.get</code> (send its <code>ID</code> as <code>ASSIGNED_BY_ID</code>), <code>crm.status.list?filter[ENTITY_ID]=SOURCE</code> (send its <code>STATUS_ID</code> as <code>SOURCE_ID</code>) and <code>crm.lead.userfield.add</code> (accepted, does nothing). A <code>UF_…PROJECT…</code> field sets the project, <code>SOURCE_DESCRIPTION</code> is saved as Source information, <code>COMMENTS</code> as Notes and <code>FORM_NAME</code> as the campaign. Plain parameters sent beside <code>fields</code> win over them; with a plain <code>name</code> the answer is the normal AMS answer. Notes are only ever what you send as <code>notes</code> / <code>COMMENTS</code>.</p>
        <code className={code}>{`POST ${base}/api/rest/<key>/crm.lead.add.json
{"fields":{"NAME":"Ali","LAST_NAME":"Khan","PHONE":[{"VALUE":"+92 300 1234567"}],"SOURCE_ID":"Facebook","ASSIGNED_BY_ID":"<id from user.get>","COMMENTS":"3 bed","UF_CRM_PROJECT":"Emaar Oceanfront","FORM_NAME":"Meta form A"}}`}</code>
      </Card>

      <div className="space-y-4">
        {methods.map((m) => (
          <Card key={m.method} id={m.method} className="scroll-mt-20 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-mono text-base font-semibold">{m.method}</code>
              <span className="rounded bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-muted">scope: {m.scope}</span>
              {m.changes_data && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">changes data</span>}
            </div>
            <p className="mt-1.5 text-sm text-muted">{m.description}</p>
            {m.params.length > 0 ? (
              <table className="mt-3 w-full text-sm">
                <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-1.5 pr-3 font-medium">Parameter</th><th className="py-1.5 pr-3 font-medium">Type</th><th className="py-1.5 font-medium">What it is</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {m.params.map((p) => (
                    <tr key={p.name}><td className="py-1.5 pr-3 align-top"><code className="font-mono text-[13px]">{p.name}</code>{p.required && <span className="ml-1 text-[10px] font-semibold uppercase text-red-600">required</span>}</td><td className="py-1.5 pr-3 align-top text-xs text-muted">{p.type}</td><td className="py-1.5 align-top">{p.description}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="mt-2 text-xs text-muted">No parameters.</p>}
          </Card>
        ))}
      </div>

      <Card className="mt-6 space-y-3 p-5 text-sm">
        <h2 className="font-semibold">Outbound webhooks</h2>
        <p>AMS POSTs <code>{`{ "event": "lead.created", "ts": "…", "data": { … } }`}</code> to your address for the events you tick: {DEV_EVENTS.map((e) => e.key).join(", ")}.</p>
        <p>Check it came from AMS: header <code>X-AMS-Signature: sha256=&lt;HMAC-SHA256 of the raw body with your signing secret&gt;</code>.</p>
      </Card>
    </div>
  );
}
