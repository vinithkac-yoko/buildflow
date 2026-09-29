import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveSession } from "@/core/auth/service";
import { SESSION_COOKIE, verifySessionToken } from "./session-token";

/** Current session (user + ctx) or null. Cached per request. */
export const getSession = cache(async () => {
  const jar = await cookies();
  const sid = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!sid) return null;
  return resolveSession(sid);
});

/** For pages and actions that need a signed-in user. Redirects to /login otherwise. */
export async function requireSession() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function currentSessionId(): Promise<string | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}
