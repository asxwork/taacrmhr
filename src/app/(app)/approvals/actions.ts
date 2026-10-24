"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { cancelRequest, decide } from "@/lib/approvals";
import { str, type FormState } from "@/lib/utils";

export async function decideRequest(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const decision = str(fd, "decision") === "rejected" ? "rejected" : "approved";
  const res = await decide(user, str(fd, "id"), decision, str(fd, "comment") || undefined);
  if ("error" in res) return { error: res.error };
  revalidatePath("/", "layout");
  return { ok: true, message: decision === "approved" ? "Approved." : "Rejected." };
}

export async function cancelMyRequest(fd: FormData) {
  const user = await requireUser();
  await cancelRequest(user, str(fd, "id"));
  revalidatePath("/approvals");
}
