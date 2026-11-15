import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { chatUnread, myThreads, threadMessages } from "@/lib/chat";

/** Polled by the Messenger page: conversations (and unread), plus new messages of the open one. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "chat")) return Response.json({ error: "Not allowed" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const thread = sp.get("thread");
  const after = sp.get("after") ? new Date(sp.get("after")!) : undefined;
  const before = sp.get("before") ? new Date(sp.get("before")!) : undefined;
  const [threads, unread, msgs] = await Promise.all([
    sp.get("list") === "0" ? null : myThreads(user.id),
    chatUnread(user.id),
    thread ? threadMessages(user.id, thread, after && !Number.isNaN(+after) ? after : undefined, before && !Number.isNaN(+before) ? before : undefined) : null,
  ]);
  return Response.json({ threads, unread, ...(msgs ? msgs : {}) }, { headers: { "Cache-Control": "no-store" } });
}
