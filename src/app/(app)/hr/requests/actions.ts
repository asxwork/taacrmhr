"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { submitTypedRequest } from "@/lib/requests";
import type { FormState } from "@/lib/utils";

export async function sendRequest(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const res = await submitTypedRequest(user, String(fd.get("slug") ?? ""), fd);
  if (res.error || !res.requestId) return res;
  revalidatePath("/approvals");
  redirect(`/approvals?tab=mine&open=${res.requestId}`);
}
