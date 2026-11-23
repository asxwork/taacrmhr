// Direct connection to Bitrix24 through an inbound webhook (Bitrix: Developer resources → Other → Inbound webhook,
// with the CRM and Users permissions). Reads everything a lead has — the lead, its activities, timeline comments
// and stage history, and who the people are — and hands it to the same importer as the SQL Lab files.
// Only reads: nothing in Bitrix is changed. The link is used for this run only and never saved.
import type { BitrixFiles } from "./bitrix-import";

type Row = Record<string, string>;
type Any = Record<string, unknown>;

/** "https://yourcompany.bitrix24.com/rest/1/abc123xyz/" (anything after the code, like "profile.json", is dropped). */
export function webhookBase(raw: string): string | null {
  const m = /^(https:\/\/[a-z0-9.-]+\/rest\/\d+\/[a-z0-9]+)\/?/i.exec(raw.trim());
  return m ? `${m[1]}/` : null;
}

/** PHP-style query string, the way Bitrix's batch commands expect it (filter[ID]=1&select[0]=*). */
function qs(v: unknown, prefix = ""): string[] {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.flatMap((x, i) => qs(x, `${prefix}[${i}]`));
  if (typeof v === "object") return Object.entries(v as Any).flatMap(([k, x]) => qs(x, prefix ? `${prefix}[${k}]` : k));
  return [`${encodeURIComponent(prefix)}=${encodeURIComponent(String(v))}`];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(base: string, method: string, params: Any = {}): Promise<Any> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${base}${method}.json`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params), signal: AbortSignal.timeout(90_000) });
    } catch (e) {
      if (attempt < 3) { await sleep(2000 * (attempt + 1)); continue; }
      throw new Error(`Bitrix didn't answer (${e instanceof Error ? e.message : "network error"}).`);
    }
    const body = (await res.json().catch(() => ({}))) as Any;
    const err = String(body.error ?? "");
    // Bitrix allows about 2 requests a second: wait and try again.
    if ((err === "QUERY_LIMIT_EXCEEDED" || res.status === 503) && attempt < 8) { await sleep(1500 * (attempt + 1)); continue; }
    if (err === "NO_AUTH_FOUND" || err === "INVALID_CREDENTIALS" || res.status === 401) throw new Error("Bitrix refused the webhook link. Check it is copied in full and the webhook is still active.");
    if (err === "insufficient_scope" || err === "ACCESS_DENIED") throw new Error(`The webhook has no permission for ${method}. Edit it in Bitrix and tick CRM and Users.`);
    if (err) throw new Error(`Bitrix: ${String(body.error_description || err)} (${method})`);
    if (!res.ok) throw new Error(`Bitrix answered ${res.status} for ${method}.`);
    return body;
  }
}

/** Every row of a list method: the first page, then the rest 50 pages (2,500 rows) per batch call. */
async function listAll(base: string, method: string, params: Any, pick: (result: unknown) => unknown[] = (r) => r as unknown[]): Promise<Any[]> {
  const first = await call(base, method, { ...params, start: 0 });
  const out = pick(first.result) as Any[];
  const total = Number(first.total ?? out.length);
  const starts: number[] = [];
  for (let s = 50; s < total; s += 50) starts.push(s);
  for (let i = 0; i < starts.length; i += 50) {
    const cmd = Object.fromEntries(starts.slice(i, i + 50).map((s) => [`p${s}`, `${method}?${qs({ ...params, start: s }).join("&")}`]));
    const r = (await call(base, "batch", { halt: 0, cmd })).result as { result: Record<string, unknown>; result_error?: Record<string, { error_description?: string }> };
    const bad = Object.values(r.result_error ?? {})[0];
    if (bad) throw new Error(`Bitrix: ${bad.error_description ?? "a page could not be read"} (${method})`);
    for (const k of Object.keys(cmd)) out.push(...(pick(r.result[k]) as Any[]));
  }
  return out;
}

/** Bitrix times ("2026-02-20T14:07:31+05:00") as the Karachi wall-clock text the file importer reads. */
const pk = (v: unknown) => {
  if (!v) return "";
  const d = new Date(String(v));
  return Number.isNaN(+d) ? "" : new Date(+d + 5 * 3600_000).toISOString().slice(0, 19).replace("T", " ");
};
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export type FetchProgress = (step: string) => void;

/** `since`: only what changed in Bitrix after that moment (the sync); without it, everything. */
export async function fetchFromBitrix(rawUrl: string, progress: FetchProgress, opts: { since?: Date | null } = {}): Promise<BitrixFiles & { people: number; raw: { leads: Any[]; activities: Any[]; history: Any[]; users: Any[] } }> {
  const base = webhookBase(rawUrl);
  if (!base) throw new Error("That isn't a Bitrix webhook link. It looks like https://yourcompany.bitrix24.com/rest/1/abc123…/");

  progress("Connecting and reading people, stages and sources…");
  const [active, inactive, statuses, sources, fields] = await Promise.all([
    listAll(base, "user.get", { ACTIVE: true }),
    listAll(base, "user.get", { ACTIVE: false }).catch(() => [] as Any[]),
    call(base, "crm.status.list", { filter: { ENTITY_ID: "STATUS" } }),
    call(base, "crm.status.list", { filter: { ENTITY_ID: "SOURCE" } }),
    call(base, "crm.lead.userfield.list", { filter: { LANG: "en" } }).catch(() => ({ result: [] })),
  ]);
  const person = new Map<string, string>();
  for (const u of [...active, ...inactive]) person.set(s(u.ID), [s(u.NAME), s(u.LAST_NAME)].join(" ").replace(/\s+/g, " ").trim() || s(u.EMAIL) || `User ${s(u.ID)}`);
  const who = (id: unknown) => person.get(s(id)) ?? "";
  const statusName = new Map((statuses.result as Any[]).map((x) => [s(x.STATUS_ID), s(x.NAME)]));
  const sourceName = new Map((sources.result as Any[]).map((x) => [s(x.STATUS_ID), s(x.NAME)]));
  // Project: the custom field whose label (or code) says "project"; list fields come as ids → their text.
  const uf = (fields.result as Any[]).find((f) => /project/i.test(`${s(f.EDIT_FORM_LABEL)} ${s(f.LIST_COLUMN_LABEL)} ${s(f.FIELD_NAME)}`));
  const ufList = new Map(((uf?.LIST as Any[] | undefined) ?? []).map((o) => [s(o.ID), s(o.VALUE)]));
  const projectOf = (lead: Any) => {
    if (!uf) return "";
    const v = lead[s(uf.FIELD_NAME)];
    const one = (x: unknown) => ufList.get(s(x)) ?? s(x);
    return Array.isArray(v) ? v.map(one).filter(Boolean).join(", ") : one(v);
  };

  progress("Reading leads…");
  // Bitrix compares in the portal's time; an ISO time with its offset is understood either way.
  const after = opts.since ? new Date(+opts.since - 10 * 60_000).toISOString() : null;
  const leadsRaw = await listAll(base, "crm.lead.list", { order: { ID: "ASC" }, select: ["*", "UF_*", "PHONE", "EMAIL"], ...(after ? { filter: { ">DATE_MODIFY": after } } : {}) });
  const multi = (v: unknown) => ((v as Any[] | undefined) ?? []).map((p) => `[${s(p.VALUE_TYPE) || "OTHER"}] ${s(p.VALUE)}`).join(", ");
  const leads: Row[] = leadsRaw.map((l) => ({
    id: s(l.ID), title: s(l.TITLE),
    full_name: [s(l.NAME), s(l.SECOND_NAME), s(l.LAST_NAME)].join(" ").replace(/\s+/g, " ").trim(),
    status_name: statusName.get(s(l.STATUS_ID)) ?? s(l.STATUS_ID), status_semantic_id: s(l.STATUS_SEMANTIC_ID),
    source_name: sourceName.get(s(l.SOURCE_ID)) ?? s(l.SOURCE_ID), source_description: s(l.SOURCE_DESCRIPTION),
    assigned_by_name: who(l.ASSIGNED_BY_ID), created_by: who(l.CREATED_BY_ID),
    phone: multi(l.PHONE), email: multi(l.EMAIL), comments: s(l.COMMENTS), utm_campaign: s(l.UTM_CAMPAIGN),
    date_create: pk(l.DATE_CREATE), date_modify: pk(l.DATE_MODIFY), moved_time: pk(l.MOVED_TIME), date_closed: pk(l.DATE_CLOSED),
    project: projectOf(l),
  }));

  progress(`Read ${leads.length.toLocaleString()} leads. Reading their activities…`);
  const actsRaw = await listAll(base, "crm.activity.list", { order: { ID: "ASC" }, filter: { OWNER_TYPE_ID: 1, ...(after ? { ">LAST_UPDATED": after } : {}) }, select: ["*"] });
  // Bitrix activity types: 1 meeting, 2 call, 3 task, 4 e-mail, 6 to-do / other.
  const TYPE: Record<string, string> = { "1": "Meeting", "2": "Call", "3": "Task", "4": "E-mail" };
  const activities: Row[] = actsRaw.map((a) => ({
    id: s(a.ID), lead_id: s(a.OWNER_ID), owner_id: s(a.OWNER_ID), type_id: s(a.TYPE_ID), type_name: TYPE[s(a.TYPE_ID)] ?? "To-do",
    provider_type_id: s(a.TYPE_ID) === "2" ? "CALL" : s(a.PROVIDER_TYPE_ID), subject: s(a.SUBJECT), description: s(a.DESCRIPTION),
    completed: s(a.COMPLETED), status_name: "",
    responsible_name: who(a.RESPONSIBLE_ID), author_name: who(a.AUTHOR_ID),
    date_create: pk(a.CREATED), date_modify: pk(a.LAST_UPDATED), start_time: pk(a.START_TIME), end_time: pk(a.END_TIME), deadline: pk(a.DEADLINE),
  }));

  progress(`Read ${activities.length.toLocaleString()} activities. Reading timeline comments (50 leads at a time)…`);
  const comments: Row[] = [];
  // Comments of every lead read (a sync: the leads changed, and the leads whose activities changed).
  const ids = [...new Set([...leads.map((l) => l.id), ...activities.map((a) => a.lead_id)].filter(Boolean))];
  for (let i = 0; i < ids.length; i += 50) {
    const cmd = Object.fromEntries(ids.slice(i, i + 50).map((id) => [`c${id}`, `crm.timeline.comment.list?${qs({ filter: { ENTITY_ID: id, ENTITY_TYPE: "lead" }, select: ["ID", "CREATED", "ENTITY_ID", "AUTHOR_ID", "COMMENT"] }).join("&")}`]));
    const r = (await call(base, "batch", { halt: 0, cmd })).result as { result: Record<string, Any[]> };
    for (const [k, rows] of Object.entries(r.result ?? {})) {
      for (const c of rows ?? []) comments.push({ id: s(c.ID), lead_id: s(c.ENTITY_ID) || k.slice(1), comment: s(c.COMMENT), author_name: who(c.AUTHOR_ID), date_create: pk(c.CREATED) });
    }
    if (i % 1000 === 0) progress(`Reading timeline comments… ${Math.min(i + 50, ids.length).toLocaleString()} of ${ids.length.toLocaleString()} leads (${comments.length.toLocaleString()} comments so far)`);
  }

  progress(`Read ${comments.length.toLocaleString()} comments. Reading stage history…`);
  const histRaw = await listAll(base, "crm.stagehistory.list", { entityTypeId: 1, order: { ID: "ASC" }, ...(after ? { filter: { ">CREATED_TIME": after } } : {}), select: ["ID", "OWNER_ID", "CREATED_TIME", "STATUS_ID"] }, (r) => ((r as { items?: unknown[] })?.items ?? []))
    .catch(() => [] as Any[]);
  const history: Row[] = histRaw.map((h) => ({ id: s(h.ID), lead_id: s(h.OWNER_ID), status_name: statusName.get(s(h.STATUS_ID)) ?? s(h.STATUS_ID), date_create: pk(h.CREATED_TIME), assigned_by_name: "" }));

  return { leads, activities, history, comments, ignored: [], people: person.size, raw: { leads: leadsRaw, activities: actsRaw, history: histRaw, users: [...active, ...inactive].map((u) => ({ ID: u.ID, NAME: u.NAME, LAST_NAME: u.LAST_NAME, EMAIL: u.EMAIL, ACTIVE: u.ACTIVE, WORK_POSITION: u.WORK_POSITION })) } };
}
