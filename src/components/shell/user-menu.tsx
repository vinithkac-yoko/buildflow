"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { logoutAction } from "@/app/actions";

/** Account menu in the top bar on every screen: who you are, settings, and Sign out. */
export function UserMenu({ name, roleLabel }: { name: string; roleLabel: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-border pl-1.5 pr-2 text-sm font-semibold hover:bg-surface-2 cursor-pointer transition-colors duration-fast"
      >
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-xs code">{initials || "?"}</span>
        <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="glass absolute right-0 top-[calc(100%+6px)] z-50 w-64 rounded-xl border border-border p-2 shadow-xl animate-fade-up">
          <div className="border-b border-border px-3 pb-2 pt-1">
            <div className="truncate font-semibold">{name}</div>
            <div className="text-sm text-muted">{roleLabel}</div>
          </div>
          <Link
            role="menuitem" href="/settings" onClick={() => setOpen(false)}
            className="mt-1 flex min-h-12 items-center gap-2 rounded-lg px-3 text-[15px] hover:bg-surface-2"
          >
            <Settings className="h-5 w-5" aria-hidden /> Profile &amp; settings
          </Link>
          <form action={logoutAction}>
            <button type="submit" role="menuitem" className="flex min-h-12 w-full items-center gap-2 rounded-lg px-3 text-left text-[15px] font-semibold hover:bg-surface-2 cursor-pointer">
              <LogOut className="h-5 w-5" aria-hidden /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
