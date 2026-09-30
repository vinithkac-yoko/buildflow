"use client";

import { useState, useTransition } from "react";
import { Moon, Sun } from "lucide-react";
import { setThemeAction } from "@/app/actions";

export function ThemeToggle({ initial }: { initial: "dark" | "light" }) {
  const [theme, setTheme] = useState(initial);
  const [, start] = useTransition();

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.add("theme-fade");
    root.dataset.theme = next;
    setTheme(next);
    window.setTimeout(() => root.classList.remove("theme-fade"), 260);
    start(() => {
      void setThemeAction(next);
    });
  }

  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text hover:bg-surface-2 cursor-pointer transition-colors duration-fast"
    >
      {theme === "dark" ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
    </button>
  );
}
