"use client";

import { useActionState, useRef } from "react";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ROLE_LABEL } from "@/lib/format";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ demoMode }: { demoMode: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);

  const fill = (e: string) => {
    if (email.current) email.current.value = e;
    if (password.current) password.current.value = DEMO_PASSWORD;
    password.current?.focus();
  };

  const primary = DEMO_ACCOUNTS.filter((a) => a.primary);
  const others = DEMO_ACCOUNTS.filter((a) => !a.primary);

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input ref={email} id="email" name="email" type="email" autoComplete="username" inputMode="email" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input ref={password} id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state.error && (
          <p role="alert" className="rounded-xl border border-danger/50 px-3 py-2 text-[15px] text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <LogIn className="h-5 w-5" aria-hidden />}
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {demoMode && (
        <section aria-labelledby="demo-heading" className="panel p-4">
          <h2 id="demo-heading" className="text-sm font-semibold text-muted uppercase tracking-wide">
            Demo accounts <span className="normal-case font-normal">· password <span className="code">{DEMO_PASSWORD}</span></span>
          </h2>
          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {primary.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  onClick={() => fill(a.email)}
                  className="w-full min-h-12 rounded-xl border border-border bg-bg px-3 text-left text-[15px] hover:bg-surface-2 cursor-pointer transition-colors duration-fast"
                >
                  <span className="block font-medium">{ROLE_LABEL[a.role]}</span>
                  <span className="block code text-xs text-muted">{a.email}</span>
                </button>
              </li>
            ))}
          </ul>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-muted min-h-11 flex items-center">More demo users (other PMs and engineers)</summary>
            <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {others.map((a) => (
                <li key={a.email}>
                  <button
                    type="button"
                    onClick={() => fill(a.email)}
                    className="w-full min-h-11 rounded-xl border border-border bg-bg px-3 text-left text-sm hover:bg-surface-2 cursor-pointer"
                  >
                    {a.name} <span className="code text-xs text-muted">{a.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}
