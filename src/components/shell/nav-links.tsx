"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavIcon } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { NavGlyph } from "./icons";

interface Item { href: string; label: string; icon: NavIcon }

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function NavLinks({ items }: { items: Item[] }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {items.map((i) => {
        const active = isActive(pathname, i.href);
        return (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors duration-fast",
                active ? "bg-surface-2 text-brand-text" : "text-text hover:bg-surface-2",
              )}
            >
              <NavGlyph name={i.icon} className="h-5 w-5 shrink-0" />
              {i.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function BottomLinks({ items }: { items: Item[] }) {
  const pathname = usePathname();
  return (
    <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((i) => {
        const active = isActive(pathname, i.href);
        return (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 px-0.5 text-xs font-semibold tracking-tight transition-colors duration-fast",
                active ? "text-brand-text" : "text-muted",
              )}
            >
              <NavGlyph name={i.icon} className="h-6 w-6" />
              <span className="truncate max-w-full">{i.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
