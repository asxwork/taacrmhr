"use client";

import { useActionState, useState } from "react";
import Link from "@/components/link";
import { AlertTriangle, CheckCircle2, Copy, KeyRound, RefreshCw, Send, Trash2 } from "lucide-react";
import { deleteHook, renewHook, saveHook, testHook, type DevState } from "./actions";

type Opt = { key: string; label: string; about?: string };
type Hook = { id: string; kind: string; name: string; scopes: string[]; events: string[]; url: string | null; active: boolean; tokenHint: string | null };
type Method = { name: string; scope: string; about: string; write?: boolean };

function CopyBox({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <div className="flex items-start gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
        <code className={`min-w-0 flex-1 break-all text-[13px] ${mono ? "font-mono" : ""}`}>{value}</code>
        <button type="button" onClick={() => { void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }} className="shrink-0 rounded p-1 text-muted hover:bg-black/5 hover:text-ink" aria-label={`Copy ${label}`}>
          {done ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}

/** What to paste where, for a key (shown once after making or renewing it). */
function KeyInfo({ token, appUrl, mcp }: { token: string; appUrl: string; mcp: boolean }) {
  const rest = `${appUrl}/api/rest/${token}/`;
  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-emerald-800"><KeyRound className="size-4" /> Copy these now: the key is shown only once.</p>
      <CopyBox label="Webhook link (add a method name at the end)" value={rest} />
      <CopyBox label="Example: your newest leads" value={`${rest}crm.lead.list`} />
      {mcp && (
        <>
          <CopyBox label="Claude.ai / ChatGPT: add a custom connector with this link" value={`${appUrl}/api/mcp?key=${token}`} />
          <CopyBox label="MCP server address (apps that let you add a header)" value={`${appUrl}/api/mcp`} />
          <CopyBox label="Header" value={`Authorization: Bearer ${token}`} />
          <CopyBox label="Claude Code" value={`claude mcp add --transport http ams ${appUrl}/api/mcp --header "Authorization: Bearer ${token}"`} />
          <CopyBox label="Claude Desktop / other apps (settings JSON)" value={JSON.stringify({ mcpServers: { ams: { type: "http", url: `${appUrl}/api/mcp`, headers: { Authorization: `Bearer ${token}` } } } })} />
        </>
      )}
      <p className="text-xs text-muted">Anyone with this key can do what you can do in AMS within the ticked scopes. Keep it private; if it leaks, press Renew key.</p>
    </div>
  );
}

export function HookForm({ kind, preset, hook, appUrl, scopes, events, methods }: { kind: "inbound" | "outbound"; preset?: string[]; hook?: Hook; appUrl: string; scopes: Opt[]; events: Opt[]; methods: Method[] }) {
  const [state, act, pending] = useActionState<DevState, FormData>(saveHook, undefined);
  const [renewed, renew, renewing] = useActionState<DevState, FormData>(renewHook, undefined);
  const [tested, test, testing] = useActionState<DevState, FormData>(testHook, undefined);
  const [picked, setPicked] = useState<string[]>(hook?.scopes ?? preset ?? ["crm"]);
  const token = state?.token ?? renewed?.token;
  const secret = state?.secret ?? renewed?.secret;

  if (!hook && state?.ok) {
    return (
      <div className="space-y-4">
        {token && <KeyInfo token={token} appUrl={appUrl} mcp={picked.includes("mcp")} />}
        {secret && (
          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-800"><KeyRound className="size-4" /> Outbound webhook saved. Copy the signing secret now: it&apos;s shown only once.</p>
            <CopyBox label="Signing secret" value={secret} />
            <p className="text-xs text-muted">Each message has the header <code>X-AMS-Signature: sha256=…</code>: the HMAC-SHA256 of the body with this secret. Check it to be sure the message came from AMS.</p>
          </div>
        )}
        <Link href="/settings/developer" className="inline-flex h-9 items-center rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800">Done</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form action={act} className="space-y-4">
        {hook && <input type="hidden" name="id" value={hook.id} />}
        <input type="hidden" name="kind" value={kind} />
        <label className="block"><span className="mb-1 block text-sm font-medium">Name</span>
          <input name="name" defaultValue={hook?.name ?? (preset?.includes("mcp") ? "AI assistant (Claude)" : kind === "outbound" ? "Outbound webhook" : "Inbound webhook")} className="input" maxLength={120} placeholder="e.g. Website form, Zapier, Google Sheets" />
        </label>
        {kind === "inbound" ? (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">What it can reach (scopes)</legend>
            <div className="space-y-1.5">
              {scopes.map((s) => (
                <label key={s.key} className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-navy-900/40 has-[:checked]:bg-navy-900/[0.03]">
                  <input type="checkbox" name="scopes" value={s.key} checked={picked.includes(s.key)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.key] : p.filter((x) => x !== s.key)))} className="mt-0.5 accent-navy-900" />
                  <span><b className="font-medium">{s.label}</b><span className="block text-xs text-muted">{s.about}</span></span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">It always works with <b>your</b> permissions: it can never see or change more than you can in AMS.</p>
          </fieldset>
        ) : (
          <>
            <label className="block"><span className="mb-1 block text-sm font-medium">Send to (https:// address)</span>
              <input name="url" type="url" required defaultValue={hook?.url ?? ""} className="input font-mono text-sm" placeholder="https://hooks.zapier.com/…" />
            </label>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">When</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {events.map((e) => (
                  <label key={e.key} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-navy-900/40 has-[:checked]:bg-navy-900/[0.03]">
                    <input type="checkbox" name="events" value={e.key} defaultChecked={hook ? hook.events.includes(e.key) : e.key === "lead.created"} className="accent-navy-900" />{e.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}
        {hook && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={hook.active} className="accent-navy-900" /> On</label>}
        {state?.error && <p role="alert" className="flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{state.error}</p>}
        {state?.message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>}
        <button type="submit" disabled={pending} className="inline-flex h-9 items-center rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60">{pending ? "Saving…" : hook ? "Save" : kind === "outbound" ? "Save webhook" : "Make the key"}</button>
      </form>

      {hook && (
        <div className="space-y-3 border-t border-line pt-4">
          {kind === "inbound" ? (
            renewed?.token ? <KeyInfo token={renewed.token} appUrl={appUrl} mcp={hook.scopes.includes("mcp")} /> : (
              <>
                <CopyBox label="Webhook link" value={`${appUrl}/api/rest/ams_••••••••${hook.tokenHint ?? ""}/`} />
                {hook.scopes.includes("mcp") && <CopyBox label="MCP server address" value={`${appUrl}/api/mcp`} />}
                <p className="text-xs text-muted">For safety the key isn&apos;t shown again. Lost it? Renew it: the old one stops working at once.</p>
              </>
            )
          ) : renewed?.secret ? <CopyBox label="New signing secret (copy it now)" value={renewed.secret} /> : null}
          <div className="flex flex-wrap gap-2">
            <form action={renew}><input type="hidden" name="id" value={hook.id} />
              <button disabled={renewing} onClick={(e) => { if (!confirm(kind === "inbound" ? "Make a new key? The old one stops working straight away." : "Make a new signing secret?")) e.preventDefault(); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-canvas"><RefreshCw className="size-4" /> {kind === "inbound" ? "Renew key" : "New secret"}</button>
            </form>
            {kind === "outbound" && (
              <form action={test}><input type="hidden" name="id" value={hook.id} />
                <button disabled={testing} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-canvas"><Send className="size-4" /> {testing ? "Sending…" : "Send a test"}</button>
              </form>
            )}
          </div>
          <form action={deleteHook}><input type="hidden" name="id" value={hook.id} />
            <button onClick={(e) => { if (!confirm(`Delete “${hook.name}”? Anything using it stops working.`)) e.preventDefault(); }} className="inline-flex items-center gap-1.5 text-sm text-red-700 hover:underline"><Trash2 className="size-4" /> Delete</button>
          </form>
          {tested?.message && <p className="text-sm text-emerald-700">{tested.message}</p>}
          {tested?.error && <p className="text-sm text-red-700">{tested.error}</p>}
        </div>
      )}

      {kind === "inbound" && (
        <details className="rounded-xl border border-line">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">Methods this key can call</summary>
          <ul className="divide-y divide-line border-t border-line text-sm">
            {methods.filter((m) => picked.includes(m.scope)).map((m) => (
              <li key={m.name} className="px-4 py-2"><code className="font-mono text-[13px] font-medium">{m.name}</code>{m.write && <span className="ml-1.5 rounded bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700">changes data</span>}<p className="text-xs text-muted">{m.about}</p></li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-2 text-xs text-muted">Call: <code>GET or POST {appUrl}/api/rest/&lt;key&gt;/&lt;method&gt;</code> with the options as query or JSON. Answers <code>{"{ result, total, next }"}</code>.</p>
        </details>
      )}
    </div>
  );
}
