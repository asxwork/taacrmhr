// Tests for the inbound webhook API (Settings → Developer resources), against a running AMS with a test database:
//   DATABASE_URL=file:./dev.db npx next start -p 3100
//   DATABASE_URL=file:./dev.db npx tsx scripts/test-dev-api.ts            (BASE=http://localhost:3100)
// Covers: key in the URL and in a header, the methods list, crm.lead.add rules, scopes, owner permissions, renewed and
// switched-off keys, unknown methods. Uses throwaway keys and leads and removes them afterwards.
import { db } from "../src/lib/db";
import { hashToken, newToken } from "../src/lib/dev-api";

const BASE = process.env.BASE ?? "http://localhost:3100";
let failed = 0;
const check = (name: string, ok: boolean, info?: unknown) => { console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${JSON.stringify(info)}`}`); if (!ok) failed++; };
const call = async (path: string, init?: RequestInit) => { const r = await fetch(`${BASE}${path}`, init); return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, any> }; };
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => call(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

async function makeKey(userId: string, scopes: string) {
  const token = newToken();
  const hook = await db.devHook.create({ data: { kind: "inbound", name: "test", userId, tokenHash: hashToken(token), tokenHint: token.slice(-4), scopes } });
  return { token, hook };
}

(async () => {
  const admin = await db.user.findFirst({ where: { isSuperAdmin: true, active: true } });
  const agent = await db.user.findFirst({ where: { isSuperAdmin: false, active: true, roles: { some: { role: { name: "Agent" } } } } });
  if (!admin || !agent) throw new Error("Needs an active Super Admin and an Agent in the test database.");
  const made: string[] = [], leads: string[] = [];
  try {
    const { token, hook } = await makeKey(admin.id, "crm,users"); made.push(hook.id);

    let r = await call(`/api/rest/${token}/user.current`);
    check("key in the URL works", r.status === 200 && r.body.result?.id === admin.id, r);
    r = await call(`/api/rest/user.current`, { headers: { authorization: `Bearer ${token}` } });
    check("key in a Bearer header works", r.status === 200 && r.body.result?.id === admin.id, r);
    r = await call(`/api/rest/methods`, { headers: { "x-api-key": token } });
    const add = (r.body.result ?? []).find((m: any) => m.method === "crm.lead.add");
    check("methods lists crm.lead.add with its parameters", !!add && add.params.some((p: any) => p.name === "name" && p.required) && add.params.some((p: any) => p.name === "responsible"), r.body.result?.length);
    check("methods only lists the key's scopes", !(r.body.result ?? []).some((m: any) => m.scope === "hr"));

    r = await post(`/api/rest/${token}/crm.lead.add`, { phone: "+92 300 5550001" });
    check("lead.add without name → 400 INVALID", r.status === 400 && r.body.error === "INVALID", r);
    r = await post(`/api/rest/${token}/crm.lead.add`, { name: "API Test" });
    check("lead.add without phone or email → 400 INVALID", r.status === 400 && r.body.error === "INVALID", r);
    r = await post(`/api/rest/${token}/crm.lead.add`, { name: "API Test Lead", phone: "+92 300 5550001", source: "Website", notes: "3 bed", responsible: agent.email });
    check("lead.add creates, gives it to responsible", r.status === 200 && r.body.result?.status === "created" && r.body.result?.responsible === agent.name, r);
    if (r.body.result?.id) leads.push(r.body.result.id);
    r = await post(`/api/rest/${token}/crm.lead.add`, { name: "API Test Lead again", phone: "0300 5550001" });
    check("same phone again → merged, no duplicate", r.status === 200 && r.body.result?.status === "merged" && r.body.result?.id === leads[0], r);

    r = await call(`/api/rest/${token}/hr.employee.list`);
    check("method outside the key's scopes → 403", r.status === 403 && r.body.error === "ACCESS_DENIED", r);
    r = await call(`/api/rest/${token}/crm.nothing`);
    check("unknown method → 404 METHOD_NOT_FOUND", r.status === 404 && r.body.error === "METHOD_NOT_FOUND", r);

    // The owner's own permissions apply: an Agent can't choose who gets a lead.
    const { token: agentToken, hook: agentHook } = await makeKey(agent.id, "crm"); made.push(agentHook.id);
    r = await post(`/api/rest/${agentToken}/crm.lead.add`, { name: "API Test 2", phone: "+92 300 5550002", responsible: admin.email });
    check("owner without Reassign can't set responsible → 403", r.status === 403, r);

    // Renewed key: the old one stops at once.
    const renewed = newToken();
    await db.devHook.update({ where: { id: hook.id }, data: { tokenHash: hashToken(renewed), tokenHint: renewed.slice(-4) } });
    r = await call(`/api/rest/${token}/user.current`);
    check("renewed: old key → 401 NO_AUTH", r.status === 401 && r.body.error === "NO_AUTH", r);
    r = await call(`/api/rest/${renewed}/user.current`);
    check("renewed: new key works", r.status === 200, r);
    // Switched off.
    await db.devHook.update({ where: { id: hook.id }, data: { active: false } });
    r = await call(`/api/rest/${renewed}/user.current`);
    check("switched-off key → 401 NO_AUTH", r.status === 401, r);
    r = await call(`/api/rest/user.current`);
    check("no key at all → 401", r.status === 401, r);
  } finally {
    if (leads.length) { await db.activity.deleteMany({ where: { leadId: { in: leads } } }); await db.lead.deleteMany({ where: { id: { in: leads } } }); }
    await db.lead.deleteMany({ where: { phoneKey: { in: ["03005550001", "03005550002"] } } }).catch(() => {});
    await db.devHook.deleteMany({ where: { id: { in: made } } });
  }
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
})();
