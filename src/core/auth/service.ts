import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Role, ThemePreference } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { AppError, validation } from "../errors";
import type { Ctx } from "../types";
import { buildCtx } from "./ctx";

export const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

export const loginInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter the email address you were given."),
  password: z.string().min(1, "Enter your password."),
});
export type LoginInput = z.infer<typeof loginInput>;

// Compared against when the email is unknown so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  clientId: string | null;
  themePreference: ThemePreference | null;
  isDemo: boolean;
}

/** Pre-auth service: verifies credentials and creates a revocable Session row. */
export async function login(input: LoginInput, meta: { userAgent?: string | null; now?: Date } = {}) {
  const parsed = loginInput.safeParse(input);
  if (!parsed.success) throw validation(parsed.error.issues[0]?.message ?? "Check your email and password.");
  const now = meta.now ?? new Date();

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.isActive || !ok) {
    throw new AppError("UNAUTHORIZED", "That email and password don't match. Check them and try again.");
  }

  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const session = await db.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { expiresAt: { lt: now } } });
    const s = await tx.session.create({
      data: { userId: user.id, expiresAt, userAgent: meta.userAgent?.slice(0, 300) ?? null },
    });
    await writeAudit(tx, { userId: user.id, now }, { action: "LOGIN", entity: "Session", entityId: s.id });
    return s;
  });

  return { sessionId: session.id, expiresAt, user: toSessionUser(user) };
}

/** Logout revokes the session row, so a stolen cookie stops working immediately. */
export async function logout(sessionId: string, now: Date = new Date()) {
  const s = await db.session.findUnique({ where: { id: sessionId } });
  if (!s) return;
  await db.$transaction(async (tx) => {
    await tx.session.delete({ where: { id: sessionId } });
    await writeAudit(tx, { userId: s.userId, now }, { action: "LOGOUT", entity: "Session", entityId: sessionId });
  });
}

/** Resolve a session id to the current user + ctx; null if revoked, expired or user disabled. */
export async function resolveSession(sessionId: string, now: Date = new Date()) {
  const s = await db.session.findUnique({ where: { id: sessionId }, include: { user: true } });
  if (!s || s.expiresAt <= now || !s.user.isActive) return null;
  const ctx = await buildCtx(s.user, now);
  return { user: toSessionUser(s.user), ctx };
}

export async function setThemePreference(ctx: Ctx, theme: ThemePreference) {
  await db.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: ctx.userId }, select: { themePreference: true } });
    await tx.user.update({ where: { id: ctx.userId }, data: { themePreference: theme } });
    await writeAudit(tx, ctx, {
      action: "SET_THEME",
      entity: "User",
      entityId: ctx.userId,
      before: { themePreference: before?.themePreference ?? null },
      after: { themePreference: theme },
    });
  });
}

function toSessionUser(u: {
  id: string; email: string; name: string; role: Role; clientId: string | null;
  themePreference: ThemePreference | null; isDemo: boolean;
}): SessionUser {
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, clientId: u.clientId,
    themePreference: u.themePreference, isDemo: u.isDemo,
  };
}
