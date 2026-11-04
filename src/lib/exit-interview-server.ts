import { db } from "./db";
import { notify } from "./notify";
import { disabledFeatures } from "./features";

/** Invites someone who has just resigned (or been given notice) to fill in the exit interview. */
export async function askForExitInterview(employeeId: string) {
  if ((await disabledFeatures()).has("exitinterviews")) return;
  const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { userId: true } });
  await notify(emp?.userId, "Please fill in your exit interview", { body: "A few short questions — your honest answers help us improve. Only HR sees them.", link: "/me/exit-interview" });
}
