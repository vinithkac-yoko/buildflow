import "server-only";
import { cookies } from "next/headers";
import type { Role, ThemePreference } from "@prisma/client";

export const THEME_COOKIE = "bf_theme";
export const SUNLIGHT_COOKIE = "bf_sunlight";

export type Theme = "dark" | "light";

/** Defaults: light for the Site Engineer (sunlight), dark for office roles. User choice overrides. */
export function defaultTheme(role: Role | undefined): Theme {
  return role === "SITE_ENGINEER" ? "light" : "dark";
}

export async function resolveTheme(user: { role: Role; themePreference: ThemePreference | null } | null) {
  const jar = await cookies();
  const cookie = jar.get(THEME_COOKIE)?.value;
  const theme: Theme =
    user?.themePreference
      ? (user.themePreference.toLowerCase() as Theme)
      : cookie === "dark" || cookie === "light"
        ? cookie
        : defaultTheme(user?.role);
  const sunCookie = jar.get(SUNLIGHT_COOKIE)?.value;
  const sunlight = sunCookie ? sunCookie === "on" : user?.role === "SITE_ENGINEER";
  return { theme, sunlight };
}
