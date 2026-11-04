"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { disabledFeatures } from "@/lib/features";
import { str, type FormState } from "@/lib/utils";

export async function postToFeed(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if ((await disabledFeatures()).has("feed")) return { error: "The feed is switched off." };
  const kind = str(fd, "kind") === "kudos" ? "kudos" : "announcement";
  const body = str(fd, "body").slice(0, 2000);
  if (!body) return { error: "Write something first." };
  if (kind === "announcement") {
    if (!can(user, "hr.feed", "create")) return { error: "You can't post announcements." };
    const post = await db.feedPost.create({ data: { kind, authorId: user.id, title: str(fd, "title").slice(0, 120) || null, body, pinned: fd.get("pinned") === "on" } });
    const everyone = await db.user.findMany({ where: { active: true, NOT: { id: user.id } }, select: { id: true } });
    await db.notification.createMany({ data: everyone.map((u) => ({ userId: u.id, title: `📢 ${post.title ?? "New announcement"}`, body: body.slice(0, 200), link: "/feed" })) });
  } else {
    const to = await db.employee.findFirst({ where: { id: str(fd, "employeeId"), status: { not: "left" } }, select: { id: true, userId: true } });
    if (!to) return { error: "Choose who the kudos is for." };
    if (to.userId === user.id) return { error: "Kudos are for colleagues 🙂" };
    await db.feedPost.create({ data: { kind, authorId: user.id, employeeId: to.id, body } });
    await notify(to.userId, `🎉 ${user.name} gave you kudos`, { body: body.slice(0, 200), link: "/feed" });
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
