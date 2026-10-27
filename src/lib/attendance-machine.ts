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
  const res = await importDevicePunches(rows, null, { log: false });
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

/** Opens a TCP session, answering the machine's password challenge when it has a comm key. Read-only from here on. */
async function openSession(zk: InstanceType<typeof import("zkteco-js").default>, commKey: number) {
  await zk.ztcp.createSocket();
  const reply = await zk.ztcp.executeCmd(CMD_CONNECT, "");
  let code = reply?.readUInt16LE(0);
  if (code === CMD_ACK_UNAUTH) {
    if (!commKey) throw new Error("COMMKEY_NEEDED");
    const auth = await zk.ztcp.executeCmd(CMD_AUTH, commKeyBytes(commKey, zk.ztcp.sessionId));
    code = auth?.readUInt16LE(0);
    if (code !== CMD_ACK_OK) throw new Error("COMMKEY_WRONG");
  } else if (code !== CMD_ACK_OK) throw new Error(`CONNECT_REPLY_${code}`);
  zk.connectionType = "tcp";
}

/** Plain "connect, read, save" for a machine AMS reaches directly (public IP + port 4370, comm key 0). */
export async function syncPullMachine(id: string) {
  const m = await db.attendanceMachine.findUnique({ where: { id } });
  if (!m || m.mode !== "pull" || !m.host) return { error: "Not a direct-connection machine." };
  if (m.status === "blocked") return { error: "This machine is blocked." };
  const { default: Zkteco } = await import("zkteco-js");
  const zk = new Zkteco(m.host, m.port ?? 4370, 15_000, 0);
  try {
    await within(openSession(zk, Number(openSecret(m.commKeyEnc) ?? 0) || 0), 12_000, "connect");
    const [info, serial, name] = await within(Promise.all([zk.getInfo().catch(() => null), zk.getSerialNumber().catch(() => ""), zk.getDeviceName().catch(() => "")]), 15_000, "device info");
    const { data } = await within(zk.getAttendances(), 120_000, "reading punches");
    // Only the last few days on each sync (punches already stored are skipped anyway).
    const since = m.lastPunchAt ? m.lastPunchAt.getTime() - 3 * 86_400_000 : 0;
    const rows = data
      .map((r) => ({ deviceUserId: String(r.user_id).trim(), at: new Date(r.record_time) }))
      .filter((r) => r.deviceUserId && !Number.isNaN(r.at.getTime()) && r.at.getTime() >= since);
    const res = await importDevicePunches(rows, null, { log: false });
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
    return { ok: true as const, added: res.added, read: rows.length, unknown: res.unknown.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === "object" && e && "err" in e ? String((e as { err: unknown }).err) : String(e);
    const nice = /COMMKEY_NEEDED/.test(msg) ? "The machine has a Comm Key (password). Enter it on this machine below (read it from Menu → Comm. → Connection; don't change it)."
      : /COMMKEY_WRONG/.test(msg) ? "The machine refused the Comm Key. Check the number in Menu → Comm. → Connection."
      : /ETIMEDOUT|timeout|TIMEOUT/i.test(msg) ? "No answer from the machine (check the IP, the router's port forwarding and that the machine is on)."
      : /ECONNREFUSED/.test(msg) ? "The connection was refused (wrong port, or port forwarding points to the wrong device)."
      : /EHOSTUNREACH|ENETUNREACH/.test(msg) ? "The address can't be reached from the server." : `Connection failed: ${msg.slice(0, 200)}`;
    await db.attendanceMachine.update({ where: { id: m.id }, data: { lastSyncAt: new Date(), lastError: nice } });
    return { error: nice };
  } finally {
    await within(zk.disconnect(), 3_000, "disconnect").catch(() => {});
  }
}

/** Every approved direct-connection machine (from the sync URL / daily job). */
export async function syncAllPullMachines() {
  const ms = await db.attendanceMachine.findMany({ where: { mode: "pull", status: "approved" }, select: { id: true } });
  const out: { id: string; added?: number; error?: string }[] = [];
  for (const m of ms) {
    const r = await syncPullMachine(m.id);
    out.push({ id: m.id, ...("error" in r ? { error: r.error } : { added: r.added }) });
  }
  return out;
}
