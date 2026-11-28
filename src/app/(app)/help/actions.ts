"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { TUTORIALS } from "@/lib/tutorials";

/** Saves a tutorial quiz result (the best score is kept; passed = at least 2 of 3 right). */
export async function saveQuiz(key: string, score: number, total: number) {
  const user = await requireUser();
  if (!TUTORIALS.some((t) => t.key === key) || !Number.isInteger(score) || !Number.isInteger(total) || total < 1 || total > 10 || score < 0 || score > total) return { error: "Invalid result." };
  const passed = score >= Math.ceil(total * 0.66);
  const have = await db.tutorialQuiz.findUnique({ where: { userId_key: { userId: user.id, key } } });
  if (have) await db.tutorialQuiz.update({ where: { id: have.id }, data: { tries: { increment: 1 }, ...(score >= have.score ? { score, total } : {}), ...(passed && !have.passedAt ? { passedAt: new Date() } : {}) } });
  else await db.tutorialQuiz.create({ data: { userId: user.id, key, score, total, passedAt: passed ? new Date() : null } });
  revalidatePath("/help");
  return { passed };
}
