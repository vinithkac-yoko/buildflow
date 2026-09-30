"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { createPortal } from "react-dom";
import type { Option } from "@/lib/forms";
import { cn } from "@/lib/utils";

/**
 * Searchable select bound to an ID (controlled master data — never free text).
 * Opens as a bottom sheet on phones and a dialog on desktop; type to filter.
 */
export function SearchSelect({
  name, options, value, onChange, placeholder = "Select…", label, invalid, disabled,
}: {
  name?: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => o.label.toLowerCase().includes(n)) : options;
  }, [options, q]);

  const close = () => { setOpen(false); setQ(""); };
  const pick = (v: string) => { onChange(v); close(); };

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          "flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border bg-bg px-4 text-left text-[17px] cursor-pointer",
          invalid ? "border-danger" : "border-border",
          !selected && "text-muted",
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className="h-5 w-5 shrink-0 text-muted" aria-hidden />
      </button>

      {open && typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[65] flex items-end justify-center md:items-center" role="presentation" onKeyDown={(e) => e.key === "Escape" && close()}>
            <div className="absolute inset-0 bg-black/55" onClick={close} aria-hidden />
            <div role="dialog" aria-modal="true" aria-label={label} className="glass relative flex max-h-[80dvh] w-full flex-col rounded-t-2xl border border-border shadow-2xl animate-fade-up md:max-w-md md:rounded-2xl">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && shown[0]) { e.preventDefault(); pick(shown[0].value); } }}
                  placeholder={`Search ${label.toLowerCase()}…`}
                  aria-label={`Search ${label}`}
                  className="min-h-11 w-full bg-transparent text-[17px] outline-none placeholder:text-muted"
                />
              </div>
              <ul role="listbox" aria-label={label} className="overflow-y-auto p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                {shown.length === 0 && <li className="px-3 py-4 text-muted">Nothing matches “{q}”.</li>}
                {shown.map((o) => (
                  <li key={o.value} role="option" aria-selected={o.value === value}>
                    <button
                      type="button"
                      onClick={() => pick(o.value)}
                      className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-[17px] hover:bg-surface-2 cursor-pointer"
                    >
                      <span>{o.label}</span>
                      {o.value === value && <Check className="h-5 w-5 shrink-0 text-brand-text" aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
