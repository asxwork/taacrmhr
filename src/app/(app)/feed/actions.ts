"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { disabledFeatures } from "@/lib/features";
import { str, type FormState } from "@/lib/utils";
import { audienceUsers, badgeLabel } from "@/lib/feed";

/** Reads the audience picker: everyone, one department, one branch or chosen people. */
function readAudience(fd: FormData): string | { error: string } {
  const to = str(fd, "audience") || "all";
  if (to === "all") return "all";
  if (to === "dept") return str(fd, "deptId") ? `dept:${str(fd, "deptId")}` : { error: "Choose the department." };
  if (to === "branch") return str(fd, "branchId") ? `branch:${str(fd, "branchId")}` : { error: "Choose the branch." };
  const people = fd.getAll("people").map(String).filter(Boolean);
  return people.length ? `people:${people.join(",")}` : { error: "Choose at least one person." };
}

export async function postToFeed(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if ((await disabledFeatures()).has("feed")) return { error: "The feed is switched off." };
  const kind = str(fd, "kind") === "kudos" ? "kudos" : "announcement";
  const badge = kind === "kudos" && badgeLabel(str(fd, "badge")) ? str(fd, "badge") : null;
  const body = str(fd, "body").slice(0, 2000);
  if (!body && !badge) return { error: kind === "kudos" ? "Pick a badge or write a message." : "Write something first." };
  const audience = readAudience(fd);
  if (typeof audience !== "string") return audience;
  if (kind === "announcement") {
    if (!can(user, "hr.feed", "create")) return { error: "You can't post announcements." };
    const post = await db.feedPost.create({ data: { kind, authorId: user.id, title: str(fd, "title").slice(0, 120) || null, body, audience, pinned: fd.get("pinned") === "on" } });
    const to = (await audienceUsers(audience)).filter((id) => id !== user.id);
    if (to.length) await db.notification.createMany({ data: to.map((id) => ({ userId: id, title: `📢 ${post.title ?? "New announcement"}`, body: body.slice(0, 200), link: "/feed" })) });
  } else {
    const to = await db.employee.findFirst({ where: { id: str(fd, "employeeId"), status: { not: "left" } }, select: { id: true, userId: true } });
    if (!to) return { error: "Choose who the kudos is for." };
    if (to.userId === user.id) return { error: "Kudos are for colleagues 🙂" };
    await db.feedPost.create({ data: { kind, authorId: user.id, employeeId: to.id, title: badge, body: body || "", audience } });
    await notify(to.userId, `🎉 ${user.name} gave you kudos${badge ? `: ${badgeLabel(badge)}` : ""}`, { body: body.slice(0, 200) || undefined, link: "/feed" });
  }
  revalidatePath("/feed");
  return { ok: true, message: "Posted." };
}

export async function likePost(fd: FormData) {
  const user = await requireUser();
  const post = await db.feedPost.findUnique({ where: { id: str(fd, "id") }, select: { id: true, likes: true } });
  if (!post) return;
  const set = new Set(post.likes.split(",").filter(Boolean));
  if (set.has(user.id)) set.delete(user.id); else set.add(user.id);
  await db.feedPost.update({ where: { id: post.id }, data: { likes: [...set].join(",") } });
  revalidatePath("/feed");
}

export async function deletePost(fd: FormData) {
  const user = await requireUser();
  const post = await db.feedPost.findUnique({ where: { id: str(fd, "id") }, select: { id: true, authorId: true } });
  if (!post || (post.authorId !== user.id && !can(user, "hr.feed", "delete"))) return;
  await db.feedPost.delete({ where: { id: post.id } });
  revalidatePath("/feed");
}

/** Moderators pin a post to the top (or unpin it). */
export async function togglePin(fd: FormData) {
  const user = await requireUser();
  if (!can(user, "hr.feed", "create") && !can(user, "hr.feed", "delete")) return;
  const post = await db.feedPost.findUnique({ where: { id: str(fd, "id") }, select: { id: true, pinned: true } });
  if (!post) return;
  await db.feedPost.update({ where: { id: post.id }, data: { pinned: !post.pinned } });
  revalidatePath("/feed");
}
