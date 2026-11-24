import { redirect } from "next/navigation";
import Link from "@/components/link";
import { ArrowDownToLine, ArrowUpFromLine, Bot } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { APP_URL } from "@/lib/notify";
import { DEV_EVENTS, DEV_METHODS, DEV_SCOPES } from "@/lib/dev-api";
import { Badge, Card, Drawer, PageHeader } from "@/components/ui";
import { HookForm } from "./hook-form";

export const metadata = { title: "Developer resources" };

const CARDS = [
  { key: "inbound", icon: ArrowDownToLine, tone: "bg-sky-600", title: "Inbound webhook", about: "A private link other systems use to read and change AMS data: send leads from your website, sync with Zapier, Make or Google Sheets, build reports." },
  { key: "outbound", icon: ArrowUpFromLine, tone: "bg-violet-600", title: "Outbound webhook", about: "AMS tells another system the moment something happens: a lead is added or changes stage, an activity is logged, a deal is won." },
  { key: "mcp", icon: Bot, tone: "bg-emerald-600", title: "AI assistant (MCP)", about: "Connect Claude or another AI assistant: it can find leads, add comments and follow-ups, and answer questions about your CRM, with your permissions." },
] as const;

export default async function DeveloperPage({ searchParams }: { searchParams: Promise<{ new?: string; edit?: string }> }) {
  const user = await requireUser();
  if (!(user.isSuperAdmin || can(user, "settings.company", "edit"))) redirect("/no-access");
  const sp = await searchParams;
  const hooks = await db.devHook.findMany({ where: user.isSuperAdmin ? {} : { userId: user.id }, orderBy: { createdAt: "desc" } });
  const owners = new Map((await db.user.findMany({ where: { id: { in: [...new Set(hooks.map((h) => h.userId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const editing = sp.edit ? hooks.find((h) => h.id === sp.edit) : undefined;
  const props = { appUrl: APP_URL(), scopes: DEV_SCOPES.map((s) => ({ ...s })), events: DEV_EVENTS.map((e) => ({ ...e })), methods: DEV_METHODS.map((m) => ({ name: m.name, scope: m.scope, about: m.about, write: m.write })) };
  const scopeLabel = (k: string) => DEV_SCOPES.find((s) => s.key === k)?.label ?? k;
  const eventLabel = (k: string) => DEV_EVENTS.find((e) => e.key === k)?.label ?? k;

  return (
    <div className="max-w-6xl">
      <PageHeader title="Developer resources" description="Connect AMS to your website, other apps and AI assistants. Each connection works with the permissions of the person who made it."
        actions={<Link href="/settings/developer/docs" className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-canvas">API reference</Link>} />

      <div className="grid gap-4 md:grid-cols-3">
        {CARDS.map((c) => (
          <Link key={c.key} href={`/settings/developer?new=${c.key}`} scroll={false} className="group">
            <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:border-navy-900/25 group-hover:shadow-md">
              <span className={`mb-4 flex size-11 items-center justify-center rounded-xl text-white ${c.tone}`}><c.icon className="size-5" /></span>
              <p className="font-semibold">{c.title}</p>
              <p className="mt-1.5 text-sm text-muted">{c.about}</p>
              <p className="mt-4 text-sm font-medium text-navy-900 group-hover:underline">Create →</p>
            </Card>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-medium text-muted">Integrations</h2>
      <Card className="overflow-x-auto">
        {hooks.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">None yet. Create one above.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left">
              {["Name", "Type", "Scope / events", "Made by", "Last used", "Calls", ""].map((h) => <th key={h} className="th">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-line">
              {hooks.map((h) => {
                const isMcp = h.kind === "inbound" && h.scopes.split(",").includes("mcp");
                return (
                  <tr key={h.id} className="hover:bg-canvas/60">
                    <td className="td"><Link href={`/settings/developer?edit=${h.id}`} scroll={false} className="font-medium text-navy-900 hover:underline">{h.name}</Link>{!h.active && <span className="ml-2"><Badge>Off</Badge></span>}</td>
                    <td className="td whitespace-nowrap">{h.kind === "outbound" ? "Outbound webhook" : isMcp ? "Inbound + AI (MCP)" : "Inbound webhook"}</td>
                    <td className="td text-xs text-muted">{h.kind === "outbound" ? (h.events ?? "").split(",").filter(Boolean).map(eventLabel).join(", ") : h.scopes.split(",").filter(Boolean).map(scopeLabel).join(", ")}{h.kind === "outbound" && h.url && <span className="block truncate font-mono">{new URL(h.url).hostname}</span>}</td>
                    <td className="td whitespace-nowrap">{owners.get(h.userId) ?? "—"}</td>
                    <td className="td whitespace-nowrap text-xs text-muted">{h.lastUsedAt ? h.lastUsedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Never"}{h.lastStatus && <span className="block">{h.lastStatus}</span>}</td>
                    <td className="td tabular-nums">{h.calls.toLocaleString()}</td>
                    <td className="td text-right"><Link href={`/settings/developer?edit=${h.id}`} scroll={false} className="text-xs font-medium text-navy-900 hover:underline">Edit</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {(sp.new === "inbound" || sp.new === "outbound" || sp.new === "mcp") && (
        <Drawer title={sp.new === "outbound" ? "New outbound webhook" : sp.new === "mcp" ? "Connect an AI assistant (MCP)" : "New inbound webhook"} closeHref="/settings/developer">
          <HookForm kind={sp.new === "outbound" ? "outbound" : "inbound"} preset={sp.new === "mcp" ? ["crm", "users", "mcp"] : undefined} {...props} />
        </Drawer>
      )}
      {editing && (
        <Drawer title={editing.name} closeHref="/settings/developer">
          <HookForm kind={editing.kind === "outbound" ? "outbound" : "inbound"} hook={{ id: editing.id, kind: editing.kind, name: editing.name, scopes: editing.scopes.split(",").filter(Boolean), events: (editing.events ?? "").split(",").filter(Boolean), url: editing.url, active: editing.active, tokenHint: editing.tokenHint }} {...props} />
        </Drawer>
      )}
    </div>
  );
}
