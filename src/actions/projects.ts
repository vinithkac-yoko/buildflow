"use server";

import type { ProjectStatus } from "@prisma/client";
import { toResult } from "@/core/common";
import { changeProjectStatus, createProject, updateProject } from "@/core/projects/write";
import { createStorage } from "@/core/planning/storage";
import { requireSession } from "@/lib/auth";
import type { Values } from "@/lib/forms";

export async function createProjectAction(values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => createProject(ctx, values), "project");
}

export async function updateProjectAction(projectId: string, values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => updateProject(ctx, projectId, values), "project");
}

export async function changeProjectStatusAction(projectId: string, to: ProjectStatus) {
  const { ctx } = await requireSession();
  return toResult(() => changeProjectStatus(ctx, projectId, to), "project");
}

export async function createStorageAction(projectId: string, values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => createStorage(ctx, projectId, values), "storage location");
}
