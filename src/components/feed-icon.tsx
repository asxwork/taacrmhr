import Link from "@/components/link";
import { subDays } from "date-fns";
import { Megaphone } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { feedWhere } from "@/lib/feed";

/** Small Feed button for dashboards: announcements and kudos, with a count of posts from the last 3 days. */
export async function FeedIcon() {
  const user = await requireUser();
  const fresh = await db.feedPost.count({ where: { AND: [await feedWhere(user.id), { createdAt: { gte: subDays(new Date(), 3) } }] } }).catch(() => 0);
  return (
    <Link href="/feed" title="Feed: announcements & kudos" aria-label={`Feed${fresh ? ` (${fresh} new)` : ""}`}
      className="relative flex size-10 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-sm transition hover:-translate-y-0.5 hover:text-ink hover:shadow-md">
      <Megaphone className="size-[18px]" />
      {fresh > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-semibold text-navy-950">{fresh}</span>}
    </Link>
  );
}
