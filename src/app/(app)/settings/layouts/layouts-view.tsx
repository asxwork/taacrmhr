import Link from "@/components/link";
import { redirect } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { APPS } from "@/lib/nav";
import { LAYOUT_STYLES } from "@/lib/layouts";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { applyMinimalCrmLayout, deleteLayout, saveLayout } from "./actions";

type SP = { new?: string; edit?: string; app?: string; aud?: string; role?: string };
const AUD = { superadmin: "Super Admin", role: "Role", everyone: "Everyone" } as const;

/**
 * Settings → Layouts (Super Admin): per app, a layout for Super Admins, for a role, or for everyone. The most
 * specific one wins (Super Admin > role > everyone). Layouts arrange what permissions allow; they don't grant access.
 */
export async function LayoutsView({ searchParams, base, only, title = "Layouts" }: { searchParams: Promise<SP>; base: string; only?: string[]; title?: string }) {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/no-access");
  const sp = await searchParams;
  const [layouts, roles] = await Promise.all([db.layoutProfile.findMany({ orderBy: [{ appKey: "asc" }, { sortOrder: "asc" }] }), db.role.findMany({ orderBy: { name: "asc" } })]);
  const editing = sp.edit ? layouts.find((l) => l.id === sp.edit) : null;
  const allowed = only ?? ["home", ...APPS.map((a) => a.key)];
  const filter = sp.app && allowed.includes(sp.app) ? sp.app : only ? only[0]! : null;
  const appKey = editing?.appKey ?? filter ?? "crm";
  const back = filter ? `${base}?app=${filter}` : base;
  const shown = filter ? layouts.filter((l) => l.appKey === filter) : layouts;
  const audiences = [{ aud: "superadmin", role: "", label: "Super Admins", hint: "Everyone with Super Admin" }, ...roles.map((r) => ({ aud: "role", role: r.id, label: r.name, hint: "Everyone with this role" })), { aud: "everyone", role: "", label: "Everyone else", hint: "Anyone without a layout above" }];
  const app = APPS.find((a) => a.key === appKey);
  const hidden = new Set((editing?.hidden ?? "").split(","));
  const order = (editing?.order ?? "").split(",");
  const appName = (k: string) => (k === "home" ? "All apps & start page" : APPS.find((a) => a.key === k)?.name ?? k);
  const allPages = APPS.flatMap((a) => a.groups.flatMap((g) => g.items.flatMap((i) => i.children ?? [i])).map((i) => ({ app: a.name, href: i.href, label: i.label })));

  return (
    <>
      <PageHeader title={title} description="Give Super Admins, each role and everyone else their own look per app: the sidebar style, which menu items show, the module order and the start page. The most specific layout wins: Super Admin, then role, then everyone. Permissions still decide what each person can open."
        actions={<LinkButton href={`${base}?new=1${filter ? `&app=${filter}` : ""}`} scroll={false}><Plus className="size-4" /> New layout</LinkButton>} />
      {(!only || only.length > 1) && <div className="mb-4 flex max-w-full gap-1.5 overflow-x-auto pb-1">
        {(only ? only.length > 1 ? only.map((k) => [k, appName(k)]) : [] : [["", "All layouts"], ...allowed.map((k) => [k, appName(k)])]).map(([k, l]) => (
          <Link key={k} href={k ? `${base}?app=${k}` : base} className={(filter ?? "") === k ? "shrink-0 whitespace-nowrap rounded-full bg-navy-900 px-3 py-1.5 text-xs text-white" : "shrink-0 whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-xs hover:bg-canvas"}>{l}</Link>
        ))}
      </div>}
      {filter === "crm" && (
        // Ready-made: a clean, short menu for people who only work leads (agents).
        <Card className="mb-4 flex flex-wrap items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-medium">Minimal layout</h2>
            <p className="text-xs text-muted">A simple list menu with only the everyday screens: CRM home, My day, My leads, All leads, Follow-ups, Tasks, Pipeline, Dialer, Callbacks and Units. Opens on My day. Edit it afterwards like any layout.</p>
          </div>
          <form action={applyMinimalCrmLayout} className="flex flex-wrap items-center gap-2">
            <select name="target" className="input h-9 w-48" defaultValue={roles.find((r) => r.name === "Agent")?.id ?? "everyone"} aria-label="Who gets it">
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              <option value="everyone">Everyone else</option>
            </select>
            <button className="h-9 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800">Use Minimal layout</button>
          </form>
        </Card>
      )}
      {filter && (
        <Card className="mb-4 overflow-hidden">
          <div className="border-b border-line px-4 py-3"><h2 className="font-medium">{appName(filter)}: who sees which layout</h2><p className="text-xs text-muted">Each role can have its own menu, order, sidebar style and start page. Super Admin wins over a role; a role wins over “Everyone else”. No layout = the standard menu.</p></div>
          <ul className="divide-y divide-line">
            {audiences.map((a) => {
              const l = layouts.find((x) => x.appKey === filter && x.audience === a.aud && (x.roleId ?? "") === a.role);
              return (
                <li key={a.aud + a.role} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1"><p className="font-medium">{a.label}</p><p className="text-xs text-muted">{a.hint}</p></div>
                  {l ? <><Badge tone="navy">{l.name}</Badge><span className="text-xs text-muted">{LAYOUT_STYLES.find((s) => s.value === (l.style ?? ""))?.label}{l.hidden ? ` · ${l.hidden.split(",").length} hidden` : ""}</span><Link href={`${base}?app=${filter}&edit=${l.id}`} scroll={false} className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-canvas">Edit</Link></>
                    : <><span className="text-xs text-muted">Standard menu</span><Link href={`${base}?app=${filter}&new=1&aud=${a.aud}${a.role ? `&role=${a.role}` : ""}`} scroll={false} className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-canvas">Make layout</Link></>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <Card className="overflow-x-auto">
        {shown.length === 0 ? <EmptyState title="No layouts yet" description="Everyone sees the standard menus. Try “HR for Employees” with a simple list, or a start page for agents." /> : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Layout</th><th className="px-4 py-2.5">App</th><th className="px-4 py-2.5">For</th><th className="px-4 py-2.5">Style</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-line">
              {shown.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5"><Link href={`${base}?${filter ? `app=${filter}&` : ""}edit=${l.id}`} scroll={false} className="font-medium hover:underline">{l.name}</Link>{l.landing && <span className="block text-xs text-muted">opens {l.landing}</span>}</td>
                  <td className="px-4 py-2.5">{appName(l.appKey)}</td>
                  <td className="px-4 py-2.5"><Badge tone={l.audience === "superadmin" ? "gold" : l.audience === "role" ? "navy" : "neutral"}>{l.audience === "role" ? roles.find((r) => r.id === l.roleId)?.name ?? "Role" : AUD[l.audience as keyof typeof AUD]}</Badge></td>
                  <td className="px-4 py-2.5 text-xs">{LAYOUT_STYLES.find((s) => s.value === (l.style ?? ""))?.label}</td>
                  <td className="px-4 py-2.5 text-right"><form action={deleteLayout}><input type="hidden" name="id" value={l.id} /><button aria-label="Delete layout" title="Delete" className="p-1 text-muted hover:text-red-600"><Trash2 className="size-3.5" /></button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {(sp.new || editing) && (
        <Drawer title={editing ? `Edit ${editing.name}` : "New layout"} closeHref={back} width="max-w-2xl">
          {!editing && allowed.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {allowed.map((k) => (
                <Link key={k} href={`${base}?new=1&app=${k}${sp.aud ? `&aud=${sp.aud}` : ""}${sp.role ? `&role=${sp.role}` : ""}`} scroll={false} className={k === appKey ? "rounded-full bg-navy-900 px-3 py-1 text-xs text-white" : "rounded-full border border-line px-3 py-1 text-xs hover:bg-canvas"}>{appName(k)}</Link>
              ))}
            </div>
          )}
          <ActionForm action={saveLayout} className="space-y-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <input type="hidden" name="appKey" value={appKey} />
            <input type="hidden" name="back" value={base} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Name"><input name="name" required defaultValue={editing?.name ?? `${appName(appKey)} for ${sp.aud === "superadmin" ? "Super Admins" : sp.aud === "everyone" ? "everyone" : roles.find((r) => r.id === sp.role)?.name ?? "a role"}`} className="input" /></Field>
              <Field label="For">
                <select name="audience" defaultValue={editing?.audience ?? (["superadmin", "role", "everyone"].includes(sp.aud ?? "") ? sp.aud : "role")} className="input">
                  <option value="superadmin">Super Admins</option><option value="role">A role…</option><option value="everyone">Everyone else</option>
                </select>
              </Field>
              <Field label="Role (when “A role”)">
                <select name="roleId" defaultValue={editing?.roleId ?? sp.role ?? ""} className="input"><option value="">—</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              </Field>
              {appKey !== "home" && <Field label="Sidebar style"><select name="style" defaultValue={editing?.style ?? ""} className="input">{LAYOUT_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>}
            </div>

            {appKey === "home" ? (
              <>
                <fieldset className="min-w-0">
                  <legend className="mb-2 text-sm font-medium">App tiles to show (My Space always shows)</legend>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {APPS.map((a) => <label key={a.key} className="flex items-center gap-1.5"><input type="checkbox" name="apps" value={a.key} defaultChecked={!editing?.apps || editing.apps.split(",").includes(a.key)} /> {a.name}</label>)}
                  </div>
                </fieldset>
                <Field label="Start page after sign-in" hint="Empty = the app chooser. “All apps” in the sidebar always opens the chooser.">
                  <select name="landing" defaultValue={editing?.landing ?? ""} className="input"><option value="">App chooser</option>{allPages.map((p) => <option key={`${p.app}${p.href}`} value={p.href}>{p.app} → {p.label}</option>)}</select>
                </Field>
              </>
            ) : app && (
              <>
                <Field label="Opens on">
                  <select name="landing" defaultValue={editing?.landing ?? ""} className="input"><option value="">App default ({app.home})</option>{app.groups.flatMap((g) => g.items.flatMap((i) => i.children ?? [i])).map((i) => <option key={i.href} value={i.href}>{i.label} · {i.href}</option>)}</select>
                </Field>
                <div className="space-y-3">
                  <p className="text-sm font-medium">Modules and menu items <span className="font-normal text-muted">(untick to hide; number = order)</span></p>
                  {app.groups.map((g, gi) => (
                    <div key={gi} className="rounded-lg border border-line p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <input name={`order:${gi}`} type="number" min={1} defaultValue={order.indexOf(g.label ?? "") + 1 || gi + 1} className="input h-7 w-14 px-2 text-xs" aria-label={`Order of ${g.label ?? "main"}`} />
                        <span className="text-sm font-semibold">{g.label ?? "Main"}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                        {g.items.flatMap((i) => i.children ? i.children.map((c) => ({ ...c, label: `${i.label} › ${c.label}` })) : [i]).map((i) => (
                          <label key={i.href} className="flex items-center gap-1.5"><input type="checkbox" name="show" value={i.href} defaultChecked={!hidden.has(i.href)} /> {i.label}</label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <SubmitButton>Save layout</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
