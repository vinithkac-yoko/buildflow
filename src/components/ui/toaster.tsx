"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";

type Kind = "success" | "error";
interface ToastItem { id: number; kind: Kind; text: string }

const EVENT = "bf:toast";
let counter = 0;

/** Fire a toast from anywhere on the client. */
export function toast(kind: Kind, text: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: ++counter, kind, text } satisfies ToastItem }));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<ToastItem>).detail;
      setItems((cur) => [...cur.slice(-2), t]);
      window.setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), t.kind === "error" ? 8000 : 3500);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className="glass pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border border-border px-4 py-3 text-[15px] shadow-lg animate-fade-up"
        >
          {t.kind === "success" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-text" aria-hidden />
          ) : (
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
          )}
          <span className="flex-1">{t.text}</span>
          <button
            type="button"
            aria-label="Dismiss"
            className="-m-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:text-text cursor-pointer"
            onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
