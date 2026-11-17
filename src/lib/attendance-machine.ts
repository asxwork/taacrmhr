// Live link for ZKTeco (and compatible) attendance machines using their "Cloud Server" / ADMS push protocol:
// the machine calls /iclock/cdata on this site with its serial number and sends each punch as it happens.
// Machines are matched by serial number; a new one waits as pending until HR approves it.
import { db } from "./db";
import { importDevicePunches, parseDeviceLog } from "./attendance";
import { openSecret } from "./softphone";

const text = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain" } });

/** Records that the machine called in, creating it as pending the first time. */
export async function touchMachine(req: Request) {
  const url = new URL(req.url);
  const serial = (url.searchParams.get("SN") ?? "").replace(/[^\w-]/g, "").slice(0, 60);
  if (!serial) return null;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
  // Some firmware reports "version,users,fingerprints,punches,ip…" in INFO.
  const info = url.searchParams.get("INFO")?.slice(0, 300) || undefined;
  return db.attendanceMachine.upsert({ where: { serial }, update: { lastSeenAt: new Date(), ip, ...(info ? { info } : {}) }, create: { serial, ip, info: info ?? null, lastSeenAt: new Date() } });
}

/** First call from the machine: tells it how to send data (live, all punches since its last upload). */
export async function handshake(req: Request) {
  const m = await touchMachine(req);
  if (!m) return text("Missing SN", 400);
  return text([
    `GET OPTION FROM: ${m.serial}`, "ATTLOGStamp=None", "OPERLOGStamp=9999", "ATTPHOTOStamp=None", "ErrorDelay=60", "Delay=30",
    "TransTimes=00:00;14:05", "TransInterval=1", "TransFlag=TransData AttLog", "Realtime=1", "Encrypt=None", "TimeZone=5",
  ].join("\n"));
}

/** Data upload. Punches are saved only from approved machines; others get an error so the machine keeps them and retries. */
export async function receive(req: Request) {
  const m = await touchMachine(req);
  if (!m) return text("Missing SN", 400);
  const table = new URL(req.url).searchParams.get("table") ?? "";
  const body = (await req.text()).slice(0, 2_000_000);
  if (table !== "ATTLOG") return text("OK"); // user lists, operation logs, photos: not needed
  if (m.status !== "approved") return text("Machine not approved", 403);
  const { rows } = parseDeviceLog(body);
  await (await import("./machine-users")).storeMachineLogs(m.id, rows);
  const res = await importDevicePunches(rows, null, { log: false, machineId: m.id });
  const last = rows.reduce<Date | null>((a, r) => (!a || r.at > a ? r.at : a), null);
  const unknown = new Set([...(m.unknownIds ?? "").split(",").filter(Boolean), ...res.unknown]);
  await db.attendanceMachine.update({
    where: { id: m.id },
    data: { punches: { increment: res.added }, ...(last ? { lastPunchAt: last } : {}), unknownIds: [...unknown].slice(0, 200).join(",") || null },
  });
  return text(`OK: ${rows.length}`);
}

export const ok = async (req: Request) => { await touchMachine(req); return text("OK"); };

/** The ZK library has no connect timeout of its own, so unreachable machines are cut off here. */
const within = <T,>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT ${what}`)), ms))]);

/** ZK "comm key" handshake value (same algorithm as ZKTeco's SDK / pyzk make_commkey). */
function commKeyBytes(key: number, sessionId: number, ticks = 50) {
  let k = 0;
  for (let i = 0; i < 32; i++) k = ((key >>> i) & 1 ? (k << 1) | 1 : k << 1) >>> 0;
  k = (k + sessionId) >>> 0;
  const b = Buffer.alloc(4);
  b.writeUInt32LE(k);
  const x = Buffer.from([b[0]! ^ 0x5a, b[1]! ^ 0x4b, b[2]! ^ 0x53, b[3]! ^ 0x4f]); // "ZKSO"
  const swapped = Buffer.from([x[2]!, x[3]!, x[0]!, x[1]!]); // swap the two 16-bit halves
  const t = ticks & 0xff;
  return Buffer.from([swapped[0]! ^ t, swapped[1]! ^ t, t, swapped[3]! ^ t]);
}

const CMD_CONNECT = 1000, CMD_AUTH = 1102, CMD_ACK_OK = 2000, CMD_ACK_UNAUTH = 2005;

type Zk = InstanceType<typeof import("zkteco-js").default>;
type Transport = "tcp" | "udp";

/**
 * Opens a session over TCP or UDP, answering the machine's password challenge. Many ZKTeco firmwares ask every client
 * to authenticate even when no Comm Key is set; like ZKTeco's own tools (and ResourceInn) we then answer with key 0.
 * Read-only from here on.
 */
async function openSession(zk: Zk, transport: Transport, commKey: number) {
  const t = transport === "udp" ? zk.zudp : zk.ztcp;
  await t.createSocket();
  const reply = await t.executeCmd(CMD_CONNECT, "");
  let code = reply?.readUInt16LE(0);
  if (code === CMD_ACK_UNAUTH) {
    const auth = await t.executeCmd(CMD_AUTH, commKeyBytes(commKey, t.sessionId));
    code = auth?.readUInt16LE(0);
    if (code !== CMD_ACK_OK) throw new Error(commKey ? "COMMKEY_WRONG" : "COMMKEY_NEEDED");
  } else if (code !== CMD_ACK_OK) throw new Error(`CONNECT_REPLY_${code}`);
  zk.connectionType = transport;
}

/**
 * Connects the way ResourceInn-style tools do: TCP then UDP (some machines only answer one), and for each the saved
 * Comm Key then 0. The first combination that works is returned so it can be remembered for next time.
 */
export async function connectMachine(host: string, port: number, savedKey: number, prefer?: string | null): Promise<{ zk: Zk; usedKey: number; transport: Transport }> {
  const { default: Zkteco } = await import("zkteco-js");
  const transports: Transport[] = prefer === "udp" ? ["udp", "tcp"] : ["tcp", "udp"];
  const keys = savedKey ? [savedKey, 0] : [0];
  const errors: Error[] = [];
  const tried: string[] = [];
  for (const transport of transports) {
    for (const key of keys) {
      const zk = new Zkteco(host, port, 10_000, 0);
      try {
        await within(openSession(zk, transport, key), 10_000, "connect");
        return { zk, usedKey: key, transport };
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        errors.push(err);
        tried.push(`${transport.toUpperCase()} key ${key ? "saved" : "0"}: ${/COMMKEY_/.test(err.message) ? "password refused" : /TIMEOUT|ETIMEDOUT/i.test(err.message) ? "no answer" : /ECONNREFUSED/.test(err.message) ? "port closed" : err.message.slice(0, 60)}`);
        await within(zk.disconnect(), 3_000, "disconnect").catch(() => {});
        // A machine that didn't answer at all won't take another key over this transport.
        if (!(e instanceof Error && /COMMKEY_/.test(e.message))) break;
      }
    }
  }
  // Most useful reason first: a refused key beats "no answer" on the other transport.
  const key = errors.find((e) => /COMMKEY_/.test(e.message));
  const detail = ` [Tried: ${tried.join("; ")}]`;
  if (key) throw new Error((savedKey ? "COMMKEY_WRONG" : "COMMKEY_NEEDED") + detail);
  throw new Error((errors[0]?.message ?? "TIMEOUT connect") + detail);
}

// ---- Reading data the way ZKTeco's reference client does: record sizes differ by model/firmware ----
// (K40 / older firmware: 8- or 16-byte punch records and 28-byte users; newer: 40-byte punches and 72-byte users.)
const REQ_ATTLOG = Buffer.from([0x01, 0x0d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const REQ_USERS = Buffer.from([0x01, 0x09, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const CMD_OPTIONS_RRQ = 11;

/** ZK packed time: seconds since 2000 in a mixed-radix form; machine wall-clock time (server runs on Karachi time). */
function zkTime(t: number) {
  const second = t % 60; t = Math.floor(t / 60);
  const minute = t % 60; t = Math.floor(t / 60);
  const hour = t % 24; t = Math.floor(t / 24);
  const day = (t % 31) + 1; t = Math.floor(t / 31);
  const month = t % 12; t = Math.floor(t / 12);
  return new Date(t + 2000, month, day, hour, minute, second);
}
const zkString = (b: Buffer) => b.toString("latin1").split("\0")[0]!.trim();

async function readBlock(zk: Zk, transport: Transport, req: Buffer) {
  const t = transport === "udp" ? zk.zudp : zk.ztcp;
  await t.freeData().catch(() => null);
  const r = await t.readWithBuffer(req);
  await t.freeData().catch(() => null);
  const buf = r?.data;
  if (!buf || buf.length < 4) return Buffer.alloc(0);
  const size = buf.readUInt32LE(0);
  return buf.subarray(4, 4 + Math.min(size, buf.length - 4));
}

/** One option from the machine, e.g. "~SerialNumber". */
async function readOption(zk: Zk, transport: Transport, key: string) {
  const t = transport === "udp" ? zk.zudp : zk.ztcp;
  const reply = await t.executeCmd(CMD_OPTIONS_RRQ, `${key}\0`);
  const text = zkString(reply.subarray(8));
  return text.includes("=") ? text.split("=").slice(1).join("=").trim() : "";
}

export type ZkUser = { uid: number; userId: string; name: string; role: number; cardNo: string };
async function readUsers(zk: Zk, transport: Transport, count: number | null): Promise<ZkUser[]> {
  return decodeUsers(await readBlock(zk, transport, REQ_USERS), count);
}
export function decodeUsers(body: Buffer, count: number | null): ZkUser[] {
  if (!body.length) return [];
  const size = count && body.length % count === 0 ? body.length / count : body.length % 72 === 0 ? 72 : 28;
  const out: ZkUser[] = [];
  for (let o = 0; o + size <= body.length; o += size) {
    const r = body.subarray(o, o + size);
    if (size === 28) out.push({ uid: r.readUInt16LE(0), role: r[2]!, name: zkString(r.subarray(8, 16)), cardNo: String(r.readUInt32LE(16)), userId: String(r.readUInt32LE(24)) });
    else out.push({ uid: r.readUInt16LE(0), role: r[2]!, name: zkString(r.subarray(11, 35)), cardNo: String(r.readUInt32LE(35)), userId: zkString(r.subarray(48, 72)) || String(r.readUInt16LE(0)) });
  }
  return out;
}

async function readPunches(zk: Zk, transport: Transport, count: number | null, users: ZkUser[]) {
  return decodePunches(await readBlock(zk, transport, REQ_ATTLOG), count, users);
}
export function decodePunches(body: Buffer, count: number | null, users: ZkUser[]) {
  if (!body.length) return [];
  const byUid = new Map(users.map((u) => [u.uid, u.userId]));
  const guess = body.length % 40 === 0 ? 40 : body.length % 16 === 0 ? 16 : 8;
  const size = count && body.length % count === 0 && [8, 16, 40].includes(body.length / count) ? body.length / count : guess;
  const out: { deviceUserId: string; at: Date }[] = [];
  for (let o = 0; o + size <= body.length; o += size) {
    const r = body.subarray(o, o + size);
    if (size === 8) { const uid = r.readUInt16LE(0); out.push({ deviceUserId: byUid.get(uid) ?? String(uid), at: zkTime(r.readUInt32LE(3)) }); }
    else if (size === 16) out.push({ deviceUserId: String(r.readUInt32LE(0)), at: zkTime(r.readUInt32LE(4)) });
    else { const uid = r.readUInt16LE(0); out.push({ deviceUserId: zkString(r.subarray(2, 26)) || byUid.get(uid) || String(uid), at: zkTime(r.readUInt32LE(27)) }); }
  }
  // Drop impossible dates (a misread record), keep the rest.
  const now = Date.now() + 86_400_000;
  return out.filter((p) => p.deviceUserId && p.deviceUserId !== "0" && !Number.isNaN(+p.at) && p.at.getFullYear() >= 2010 && +p.at <= now);
}

/** Plain "connect, read, save" for a machine AMS reaches directly (public IP + port 4370, comm key 0). */
export async function syncPullMachine(id: string, trigger: "cron" | "manual" = "manual") {
  const m = await db.attendanceMachine.findUnique({ where: { id } });
  if (!m || m.mode !== "pull" || !m.host) return { error: "Not a direct-connection machine." };
  if (m.status === "blocked") return { error: "This machine is blocked." };
  // Fetch history row (Machines → Logs → Fetch history), finished below with the result.
  const fetch = await db.machineFetch.create({ data: { machineId: m.id, trigger } }).catch(() => null);
  const finish = (data: { read?: number; saved?: number; added?: number; error?: string | null }) =>
    fetch ? db.machineFetch.update({ where: { id: fetch.id }, data: { ...data, endedAt: new Date() } }).catch(() => null) : null;
  let zk: Zk | null = null;
  try {
    const savedKey = Number(openSecret(m.commKeyEnc) ?? 0) || 0;
    const conn = await connectMachine(m.host, m.port ?? 4370, savedKey, m.transport);
    zk = conn.zk;
    // Remember what worked; if the machine has no password after all, forget the wrong key.
    await db.attendanceMachine.update({ where: { id: m.id }, data: { transport: conn.transport, ...(savedKey && conn.usedKey === 0 ? { commKeyEnc: null, requiresAuth: false } : {}) } });
    const t = conn.transport;
    const info = await within(zk.getInfo(), 15_000, "device info").catch(() => null);
    const serial = await within(readOption(zk, t, "~SerialNumber"), 10_000, "device info").catch(() => "");
    const name = await within(readOption(zk, t, "~DeviceName"), 10_000, "device info").catch(() => "");
    const zkUsers = await within(readUsers(zk, t, info?.userCounts ?? null), 60_000, "reading users").catch(() => [] as ZkUser[]);
    const all = await within(readPunches(zk, t, info?.logCounts ?? null, zkUsers), 180_000, "reading punches");
    const mu = await import("./machine-users");
    // Every punch on the machine goes into Machine logs (duplicates skipped), mapped or not.
    const hadLogs = (await db.machineLog.count({ where: { machineId: m.id } })) > 0;
    const saved = await mu.storeMachineLogs(m.id, all);
    if (zkUsers.length) await mu.saveMachineUsers(m.id, zkUsers.map((u) => ({ deviceUserId: u.userId, name: u.name, cardNo: u.cardNo, role: u.role })));
    // Attendance takes the last few days on each sync (so a punch HR deleted doesn't come back); the very first time
    // this machine's logs are kept, everything on it is brought in for the users already mapped.
    const since = hadLogs && m.lastPunchAt ? m.lastPunchAt.getTime() - 3 * 86_400_000 : 0;
    const rows = all.filter((r) => r.at.getTime() >= since);
    const res = await importDevicePunches(rows, null, { log: false, machineId: m.id });
    const last = rows.reduce<Date | null>((a, r) => (!a || r.at > a ? r.at : a), null);
    const unknown = new Set([...(m.unknownIds ?? "").split(",").filter(Boolean), ...res.unknown]);
    await db.attendanceMachine.update({
      where: { id: m.id },
      data: {
        lastSeenAt: new Date(), lastSyncAt: new Date(), lastError: null, punches: { increment: res.added }, ...(last && (!m.lastPunchAt || last > m.lastPunchAt) ? { lastPunchAt: last } : {}),
        unknownIds: [...unknown].slice(0, 200).join(",") || null,
        info: [String(serial).replace(/\0/g, "").trim() && `SN ${String(serial).replace(/\0/g, "").trim()}`, String(name).replace(/\0/g, "").trim(), info && `${info.userCounts} users, ${info.logCounts} punches stored on machine`].filter(Boolean).join(" · ") || m.info,
      },
    });
    await finish({ read: all.length, saved, added: res.added, error: null });
    return { ok: true as const, added: res.added, read: all.length, saved, unknown: res.unknown.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === "object" && e && "err" in e ? String((e as { err: unknown }).err) : String(e);
    const tried = msg.match(/\[Tried: [^\]]*\]/)?.[0] ?? "";
    const nice0 = /COMMKEY_NEEDED/.test(msg) ? "The machine asked for a password and 0 didn't work. Tick “Machine requires authentication” and enter its Comm Key (Menu → Comm. → Connection → Comm Key; read it, don't change it)."
      : /COMMKEY_WRONG/.test(msg) ? "The machine refused the Comm Key (tried over TCP and UDP, and 0 as well). Check the number in Menu → Comm. → Connection → Comm Key."
      : /TIMEOUT (reading punches|reading users|device info)/.test(msg) ? "Connected to the machine, but it stopped answering while sending its data. Try Fetch again; if it keeps happening, use Machine logs upload (USB file) on the mapping page."
      : /ETIMEDOUT|timeout|TIMEOUT/i.test(msg) ? "No answer from the machine (check the IP, the router's port forwarding and that the machine is on)."
      : /ECONNREFUSED/.test(msg) ? "The connection was refused (wrong port, or port forwarding points to the wrong device)."
      : /EHOSTUNREACH|ENETUNREACH/.test(msg) ? "The address can't be reached from the server." : `Connection failed: ${msg.slice(0, 200)}`;
    const nice = nice0 + (tried ? ` ${tried}` : "");
    await db.attendanceMachine.update({ where: { id: m.id }, data: { lastSyncAt: new Date(), lastError: nice } });
    await finish({ error: nice });
    return { error: nice };
  } finally {
    if (zk) await within(zk.disconnect(), 3_000, "disconnect").catch(() => {});
  }
}

/** Every approved direct-connection machine (from the sync URL / daily job). */
export async function syncAllPullMachines() {
  const ms = await db.attendanceMachine.findMany({ where: { mode: "pull", status: "approved" }, select: { id: true, name: true, serial: true } });
  const out: { machine: string; read?: number; saved?: number; added?: number; error?: string }[] = [];
  for (const m of ms) {
    const r = await syncPullMachine(m.id, "cron");
    out.push({ machine: m.name ?? m.serial, ...("error" in r ? { error: r.error } : { read: r.read, saved: r.saved, added: r.added }) });
  }
  return out;
}
