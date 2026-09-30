import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { resolveTheme } from "@/lib/theme";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/");
  const { theme } = await resolveTheme(null);
  const demo = isDemoMode();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-8 w-8 rounded-lg bg-brand grid place-items-center text-brand-on font-bold code">B</span>
          <span className="text-xl font-semibold tracking-tight">BUILDFlow</span>
        </div>
        <div className="flex items-center gap-2">
          {demo && (
            <span className="rounded-md border border-warn/50 px-2 py-0.5 text-xs font-semibold tracking-wide text-warn">DEMO</span>
          )}
          <ThemeToggle initial={theme} />
        </div>
      </div>

      <div className="my-auto py-10 space-y-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold">Every site, one screen.</h1>
          <p className="mt-2 text-muted text-[17px]">Sign in to run your projects.</p>
        </div>
        <LoginForm demoMode={demo} />
      </div>
    </div>
  );
}
