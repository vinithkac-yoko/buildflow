"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logout, setThemePreference } from "@/core/auth/service";
import { getSession, currentSessionId } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session-token";
import { SUNLIGHT_COOKIE, THEME_COOKIE } from "@/lib/theme";

const ONE_YEAR = 60 * 60 * 24 * 365;
const themeSchema = z.enum(["dark", "light"]);

/** Persists the theme in a cookie (no flash on load) and, when signed in, on the user (follows them across devices). */
export async function setThemeAction(theme: string) {
  const parsed = themeSchema.parse(theme);
  const jar = await cookies();
  jar.set(THEME_COOKIE, parsed, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
  const session = await getSession();
  if (session) await setThemePreference(session.ctx, parsed === "dark" ? "DARK" : "LIGHT");
}

export async function setSunlightAction(on: boolean) {
  const jar = await cookies();
  jar.set(SUNLIGHT_COOKIE, on ? "on" : "off", { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
}

export async function logoutAction() {
  const sid = await currentSessionId();
  if (sid) await logout(sid);
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
