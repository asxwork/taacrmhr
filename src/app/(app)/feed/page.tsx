import { formatDistanceToNowStrict } from "date-fns";
import { Heart, Megaphone, PartyPopper, Pin, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { cn } from "@/lib/utils";
import { deletePost, likePost, postToFeed } from "./actions";

export const metadata = { title: "Feed" };

/** Company feed: announcements from management and kudos between colleagues. */
export default async function FeedPage() {
  const user = await requireUser();
  const [posts, colleagues] = await Promise.all([
    db.feedPost.findMany({ include: { employee: { select: { fullName: true, photo: true } } }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], take: 60 }),
    db.employee.findMany({ where: { status: { not: "left" }, userId: { not: user.id } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
  ]);
  const authors = await db.user.findMany({ where: { id: { in: [...new Set(posts.map((p) => p.authorId))] } }, select: { id: true, name: true, employee: { select: { photo: true } } } });
  const author = (id: string) => authors.find((a) => a.id === id);
  const canAnnounce = can(user, "hr.feed", "create");
  const canModerate = can(user, "hr.feed", "delete");

  return (
    <>
      <PageHeader title="Feed" description="Company news and shout-outs. Thank a colleague with kudos — everyone can see it." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {posts.length === 0 && <Card><EmptyState title="Nothing here yet" description="Be the first to give a colleague kudos." /></Card>}
          {posts.map((p) => {
            const a = author(p.authorId);
            const likes = p.likes.split(",").filter(Boolean);
            const liked = likes.includes(user.id);
            return (
              <Card key={p.id} className={cn("p-4", p.kind === "announcement" && "border-navy-900/20", p.pinned && "ring-1 ring-gold-600/40")}>
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <PersonAvatar name={a?.name ?? "?"} photo={a?.employee?.photo ?? null} className="size-8" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{a?.name ?? "Someone"}</span>
                    {p.kind === "kudos" ? <span className="text-muted"> gave kudos to <span className="font-medium text-ink">{p.employee?.fullName}</span></span> : <span className="text-muted"> posted an announcement</span>}
                    <span className="block text-xs text-muted">{formatDistanceToNowStrict(p.createdAt, { addSuffix: true })}</span>
                  </span>
                  {p.pinned && <Pin className="size-4 text-gold-600" aria-label="Pinned" />}
                  {p.kind === "kudos" ? <PartyPopper className="size-5 text-amber-500" /> : <Megaphone className="size-5 text-navy-900" />}
                </div>
                {p.title && <h2 className="mb-1 font-semibold">{p.title}</h2>}
                <p className="whitespace-pre-line text-sm">{p.body}</p>
                <div className="mt-3 flex items-center gap-3">
                  <form action={likePost}><input type="hidden" name="id" value={p.id} />
                    <button className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs hover:bg-canvas", liked ? "text-red-600" : "text-muted")} aria-label={liked ? "Unlike" : "Like"}>
                      <Heart className={cn("size-4", liked && "fill-current")} /> {likes.length || ""}
                    </button>
                  </form>
                  {(p.authorId === user.id || canModerate) && (
                    <form action={deletePost} className="ml-auto"><input type="hidden" name="id" value={p.id} /><button className="rounded p-1 text-muted hover:text-red-600" aria-label="Delete post"><Trash2 className="size-4" /></button></form>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
        <div className="space-y-4 lg:order-last">
          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 font-medium"><PartyPopper className="size-4 text-amber-500" /> Give kudos</h2>
            <ActionForm action={postToFeed} className="space-y-3">
              <input type="hidden" name="kind" value="kudos" />
              <Field label="To"><select name="employeeId" required className="input"><option value="">Choose a colleague</option>{colleagues.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></Field>
              <Field label="For"><textarea name="body" required rows={3} className="input" placeholder="Thanks for staying late to close the DHA deal!" /></Field>
              <SubmitButton>Send kudos</SubmitButton>
            </ActionForm>
          </Card>
          {canAnnounce && (
            <Card className="p-4">
              <h2 className="mb-3 flex items-center gap-2 font-medium"><Megaphone className="size-4" /> Announcement</h2>
              <ActionForm action={postToFeed} className="space-y-3">
                <input type="hidden" name="kind" value="announcement" />
                <Field label="Title"><input name="title" className="input" placeholder="Office closed on Friday" /></Field>
                <Field label="Message"><textarea name="body" required rows={4} className="input" /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pinned" /> Pin to the top</label>
                <SubmitButton>Post to everyone</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
