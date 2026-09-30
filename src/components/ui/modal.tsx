"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Bottom sheet on phones, centred dialog on larger screens. Esc and backdrop click close it. */
export function Modal({
  open, onClose, title, children, wide = false,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Focus the first field for quick entry.
    window.setTimeout(() => panel.current?.querySelector<HTMLElement>("input,select,textarea,button[data-autofocus]")?.focus(), 30);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="presentation">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={
          "glass relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-border shadow-2xl animate-fade-up md:rounded-2xl " +
          (wide ? "md:max-w-3xl" : "md:max-w-xl")
        }
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 id={titleId} className="text-lg">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 grid h-11 w-11 place-items-center rounded-lg text-muted hover:text-text cursor-pointer">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
