import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan } from "../auth/permissions";
import { zOptId, zText, demoFlag } from "../common";
import { conflict, forbidden, notFound, validation } from "../errors";
import type { Ctx } from "../types";

const ROLES = [
  "OWNER", "MARKETING", "PROJECT_MANAGER", "SITE_ENGINEER", "ACCOUNTS", "PROCUREMENT",
  "QUALITY_ENGINEER", "HR", "STORE_KEEPER", "ADMIN", "CLIENT",
] as const;

const password = z.string({ required_error: "Enter a password." }).min(8, "Password must be at least 8 characters.").max(100);

export const createUserInput = z.object({
  name: zText("the person's name", 100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: z.enum(ROLES, { errorMap: () => ({ message: "Pick a role." }) }),
  password,
  clientId: zOptId(),
});

export const updateUserInput = z.object({
  name: zText("the person's name", 100),
  role: z.enum(ROLES, { errorMap: () => ({ message: "Pick a role." }) }),
  clientId: zOptId(),
  isActive: z.preprocess((v) => v === true || v === "true", z.boolean()),
});

const publicUser = { id: true, name: true, email: true, role: true, isActive: true, clientId: true, isDemo: true, createdAt: true } as const;

export async function listUsers(ctx: Ctx) {
  assertCan(ctx, "read", "user");
  return db.user.findMany({
    select: { ...publicUser, client: { select: { name: true } } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

/** Only the Owner may hand out (or change) the Owner role — Admin cannot escalate privileges. */
function guardOwnerRole(ctx: Ctx, ...roles: Role[]) {
  if (roles.includes("OWNER") && ctx.role !== "OWNER") throw forbidden("Only the Owner can create or change Owner accounts.");
}

function checkClientLink(role: Role, clientId: string | undefined) {
  if (role === "CLIENT" && !clientId) throw validation("Pick which client this login belongs to.");
  if (role !== "CLIENT" && clientId) throw validation("Only Client logins are linked to a client.");
}

export async function createUser(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "user");
  const input = createUserInput.parse(raw);
  guardOwnerRole(ctx, input.role);
  checkClientLink(input.role, input.clientId);
  const passwordHash = await bcrypt.hash(input.password, 10);
  return db.$transaction(async (tx) => {
    if (await tx.user.findUnique({ where: { email: input.email } })) throw conflict("That email already has an account.");
    if (input.clientId && !(await tx.client.findUnique({ where: { id: input.clientId } }))) throw validation("Pick a valid client.");
    const u = await tx.user.create({
      data: { name: input.name, email: input.email, role: input.role, passwordHash, clientId: input.clientId ?? null, createdById: ctx.userId, ...demoFlag() },
    });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "User", entityId: u.id, after: { name: u.name, email: u.email, role: u.role } });
    return u.id;
  });
}

export async function updateUser(ctx: Ctx, userId: string, raw: unknown) {
  assertCan(ctx, "update", "user");
  const input = updateUserInput.parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: userId } });
    if (!before) throw notFound("That user");
    guardOwnerRole(ctx, input.role, before.role);
    checkClientLink(input.role, input.clientId);
    if (userId === ctx.userId && (!input.isActive || input.role !== before.role)) {
      throw validation("You can't deactivate yourself or change your own role.");
    }
    if (before.role === "OWNER" && (!input.isActive || input.role !== "OWNER")) {
      const owners = await tx.user.count({ where: { role: "OWNER", isActive: true } });
      if (owners <= 1) throw validation("There must always be at least one active Owner.");
    }
    const u = await tx.user.update({
      where: { id: userId },
      data: { name: input.name, role: input.role, isActive: input.isActive, clientId: input.clientId ?? null },
    });
    if (!input.isActive) await tx.session.deleteMany({ where: { userId } }); // sign them out everywhere
    await writeAudit(tx, ctx, {
      action: "UPDATE", entity: "User", entityId: userId,
      before: { name: before.name, role: before.role, isActive: before.isActive },
      after: { name: u.name, role: u.role, isActive: u.isActive },
    });
    return u.id;
  });
}

export async function resetPassword(ctx: Ctx, userId: string, rawPassword: unknown) {
  assertCan(ctx, "update", "user");
  const pw = password.parse(rawPassword);
  const hash = await bcrypt.hash(pw, 10);
  return db.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId } });
    if (!u) throw notFound("That user");
    guardOwnerRole(ctx, u.role);
    await tx.user.update({ where: { id: userId }, data: { passwordHash: hash } });
    await tx.session.deleteMany({ where: { userId } });
    await writeAudit(tx, ctx, { action: "RESET_PASSWORD", entity: "User", entityId: userId });
  });
}
