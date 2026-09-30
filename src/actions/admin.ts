"use server";

import { redirect } from "next/navigation";
import { toResult } from "@/core/common";
import { resetDemoData } from "@/core/demo/service";
import { assignUser, unassignUser } from "@/core/users/assignments";
import { createUser, resetPassword, updateUser } from "@/core/users/service";
import { requireSession } from "@/lib/auth";
import type { Values } from "@/lib/forms";

export async function createUserAction(values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => createUser(ctx, values), "user");
}

export async function updateUserAction(userId: string, values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => updateUser(ctx, userId, values), "user");
}

export async function resetPasswordAction(userId: string, values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => resetPassword(ctx, userId, values.password), "user");
}

export async function assignUserAction(values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => assignUser(ctx, { userId: values.userId ?? "", projectId: values.projectId ?? "" }), "assignment");
}

export async function unassignUserAction(assignmentId: string) {
  const { ctx } = await requireSession();
  return toResult(() => unassignUser(ctx, assignmentId), "assignment");
}

/** Owner-only, DEMO_MODE only. Recreates demo users too, so the caller must sign in again afterwards. */
export async function resetDemoAction() {
  const { ctx } = await requireSession();
  const res = await toResult(() => resetDemoData(ctx));
  if (!res.ok) return res;
  redirect("/login");
}
