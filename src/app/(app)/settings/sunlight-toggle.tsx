"use client";

import { useState, useTransition } from "react";
import { setSunlightAction } from "@/app/actions";

export function SunlightToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [, start] = useTransition();
  return (
    <label className="mt-4 flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-xl border border-border px-4">
      <span>
        <span className="block font-medium">Sunlight mode</span>
        <span className="block text-sm text-muted">Bolder text and maximum contrast for outdoor use.</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        className="h-6 w-6 accent-[rgb(var(--brand))]"
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          document.documentElement.dataset.sunlight = next ? "on" : "off";
          start(() => {
            void setSunlightAction(next);
          });
        }}
      />
    </label>
  );
}
