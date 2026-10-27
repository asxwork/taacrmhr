// Live link for ZKTeco (and compatible) attendance machines using their "Cloud Server" / ADMS push protocol:
// the machine calls /iclock/cdata on this site with its serial number and sends each punch as it happens.
// Machines are matched by serial number; a new one waits as pending until HR approves it.
import { db } from "./db";
import { importDevicePunches, parseDeviceLog } from "./attendance";

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
