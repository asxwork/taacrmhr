"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { COLOR_NAMES } from "@/lib/crm-shared";
import { str, type FormState } from "@/lib/utils";

const done = (message?: string): FormState => {
  revalidatePath("/settings/crm");
  revalidatePath("/crm", "layout");
  return { ok: true, message };
};
const colorOf = (fd: FormData) => (COLOR_NAMES.includes(str(fd, "color")) ? str(fd, "color") : "slate");
const orderOf = (fd: FormData) => Number(str(fd, "sortOrder")) || 0;

export async function saveLeadSource(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("settings.company", "edit");
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "Source name is required." };
  const clash = await db.leadSource.findUnique({ where: { name } });
  if (clash && clash.id !== id) return { error: `“${name}” already exists.` };

  if (id) await db.leadSource.update({ where: { id }, data: { name, active: fd.get("active") === "on", sortOrder: orderOf(fd) } });
  else {
    const last = await db.leadSource.aggregate({ _max: { sortOrder: true } });
    await db.leadSource.create({ data: { name, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  }
  await audit(user.id, id ? "update" : "create", "leadSource", id || null, `${id ? "Updated" : "Added"} lead source ${name}`);
  return done();
}

export async function saveLeadStatus(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("settings.company", "edit");
  const id = str(fd, "id");
  const name = str(fd, "name");
  const kind = ["open", "converted", "junk"].includes(str(fd, "kind")) ? str(fd, "kind") : "open";
  if (!name) return { error: "Status name is required." };
  const clash = await db.leadStatus.findUnique({ where: { name } });
  if (clash && clash.id !== id) return { error: `“${name}” already exists.` };

  const data = { name, kind, color: colorOf(fd), sortOrder: orderOf(fd), active: id ? fd.get("active") === "on" : true };
  if (id) {
    if (kind !== "open" || !data.active) {
      const remainingOpen = await db.leadStatus.count({ where: { kind: "open", active: true, NOT: { id } } });
      if (!remainingOpen) return { error: "Keep at least one active open status — new leads start there." };
    }
    await db.leadStatus.update({ where: { id }, data });
  } else await db.leadStatus.create({ data });
  await audit(user.id, id ? "update" : "create", "leadStatus", id || null, `${id ? "Updated" : "Added"} lead status ${name}`);
  return done();
}

export async function savePipeline(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("settings.company", "edit");
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "Pipeline name is required." };
  const clash = await db.pipeline.findUnique({ where: { name } });
  if (clash && clash.id !== id) return { error: `“${name}” already exists.` };

  const isDefault = fd.get("isDefault") === "on";
  if (isDefault) await db.pipeline.updateMany({ data: { isDefault: false } });
  if (id) await db.pipeline.update({ where: { id }, data: { name, sortOrder: orderOf(fd), ...(isDefault && { isDefault }) } });
  else {
    await db.pipeline.create({
      data: {
        name, isDefault, sortOrder: orderOf(fd),
        stages: { create: [
          { name: "New", color: "blue", kind: "open", probability: 10, sortOrder: 0 },
          { name: "Won", color: "green", kind: "won", probability: 100, sortOrder: 90 },
          { name: "Lost", color: "red", kind: "lost", probability: 0, sortOrder: 99 },
        ] },
      },
    });
  }
  await audit(user.id, id ? "update" : "create", "pipeline", id || null, `${id ? "Updated" : "Added"} pipeline ${name}`);
  return done();
}

export async function saveStage(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("settings.company", "edit");
  const id = str(fd, "id");
  const pipelineId = str(fd, "pipelineId");
  const name = str(fd, "name");
  if (!name) return { error: "Stage name is required." };
  const probability = Math.min(100, Math.max(0, Number(str(fd, "probability")) || 0));
  const unitStatus = ["hold", "booked", "sold", "rented"].includes(str(fd, "unitStatus")) ? str(fd, "unitStatus") : null;
  const data = { name, color: colorOf(fd), probability, sortOrder: orderOf(fd), unitStatus };

  if (id) await db.stage.update({ where: { id }, data });
  else await db.stage.create({ data: { ...data, pipelineId, kind: "open" } });
  await audit(user.id, id ? "update" : "create", "stage", id || null, `${id ? "Updated" : "Added"} stage ${name}`);
  return done();
}

export async function deleteStage(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("settings.company", "edit");
  const stage = await db.stage.findUnique({ where: { id: str(fd, "id") }, include: { _count: { select: { deals: true } } } });
  if (!stage) return { error: "Stage not found." };
  if (stage.kind !== "open") return { error: "Won and Lost stages can be renamed but not removed." };
  if (stage._count.deals) return { error: `Move the ${stage._count.deals} deal(s) out of “${stage.name}” first.` };
  const openLeft = await db.stage.count({ where: { pipelineId: stage.pipelineId, kind: "open", NOT: { id: stage.id } } });
  if (!openLeft) return { error: "A pipeline needs at least one open stage." };
  await db.stage.delete({ where: { id: stage.id } });
  await audit(user.id, "delete", "stage", stage.id, `Removed stage ${stage.name}`);
  return done(`Removed “${stage.name}”.`);
}
