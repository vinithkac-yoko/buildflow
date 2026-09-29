"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { login } from "@/core/auth/service";
import { AppError } from "@/core/errors";
import { rateLimit } from "@/lib/rate-limit";
import { SESSION_COOKIE, signSessionToken } from "@/lib/session-token";

export interface LoginState { error?: string }

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  // Caps are overridable so automated end-to-end runs (many logins from one IP/email) are not throttled.
  const ipMax = Number(process.env.LOGIN_RATE_LIMIT_IP ?? 20);
  const byIp = rateLimit(`login:ip:${ip}`, ipMax, 10 * 60 * 1000);
  const emailMax = Number(process.env.LOGIN_RATE_LIMIT_EMAIL ?? 8);
  const byEmail = rateLimit(`login:email:${email.toLowerCase()}`, emailMax, 10 * 60 * 1000);
  if (!byIp.ok || !byEmail.ok) {
    const wait = Math.max(byIp.retryAfterSec, byEmail.retryAfterSec);
    return { error: `Too many sign-in attempts. Wait ${Math.ceil(wait / 60)} minute(s) and try again.` };
  }

  try {
    const { sessionId, expiresAt } = await login({ email, password }, { userAgent: h.get("user-agent") });
    const token = await signSessionToken(sessionId, expiresAt);
    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: h.get("x-forwarded-proto") === "https" || (process.env.APP_URL ?? "").startsWith("https://"),
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  redirect("/");
}
