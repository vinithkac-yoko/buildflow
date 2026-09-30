"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Minus, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Field-friendly building blocks for the Site Engineer screens: big chips, stepper, quantity field, picker sheet. */

export function SectionHeader({ id, title, hint, right }: { id: string; title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="sticky top-16 z-20 -mx-4 flex min-h-14 items-center justify-between gap-3 border-b border-border bg-bg/95 px-4 backdrop-blur md:-mx-0 md:rounded-t-xl md:px-4">
      <div>
        <h2 id={id} className="text-lg">{title}</h2>
        {hint && <p className="-mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

export interface ChipOption<T extends string> { value: T; label: string; icon?: React.ReactNode }

/** Single-select chips ≥56px tall. Selected state uses a check mark AND fill, never colour alone. */
export function ChipGroup<T extends string>({
  label, value, options, onChange, columns, size = "lg", disabled,
}: {
  label: string; value: T | null | undefined; options: ChipOption<T>[]; onChange: (v: T) => void;
  columns?: number; size?: "md" | "lg"; disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 text-center font-semibold transition-colors duration-fast cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
              size === "lg" ? "min-h-16 text-[16px]" : "min-h-14 text-[15px]",
              on ? "border-brand bg-brand text-brand-on" : "border-border bg-bg text-text hover:bg-surface-2",
            )}
          >
            {o.icon}
            <span className="flex items-center gap-1 leading-tight">
              {on && <Check className="h-4 w-4 shrink-0" aria-hidden />}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Stepper({ label, value, onChange, min = 1, max = 500 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const btn = "grid h-14 w-14 place-items-center rounded-xl border-2 border-border bg-bg text-text hover:bg-surface-2 disabled:opacity-40 cursor-pointer";
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus className="h-6 w-6" aria-hidden />
      </button>
      <output aria-live="polite" className="num min-w-14 text-center text-[28px] font-semibold">{value}</output>
      <button type="button" className={btn} aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus className="h-6 w-6" aria-hidden />
      </button>
    </div>
  );
}

/** Large numeric field; the unit sits inside it so nobody has to guess. */
export function QtyInput({
  label, value, onChange, unit, invalid, id, disabled,
}: { label: string; value: string; onChange: (v: string) => void; unit: string; invalid?: boolean; id: string; disabled?: boolean }) {
  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-[15px] font-medium">{label}</label>
      <input
        id={id} inputMode="decimal" autoComplete="off" value={value} disabled={disabled} placeholder="0"
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))}
        className={cn(
          "num min-h-16 w-full rounded-xl border-2 bg-bg pl-4 pr-20 text-[28px] font-semibold placeholder:text-muted/50",
          invalid ? "border-danger" : "border-border focus:border-brand",
        )}
      />
      <span className="pointer-events-none absolute bottom-0 right-4 flex h-16 items-center text-[17px] font-semibold text-muted">{unit}</span>
    </div>
  );
}

export interface PickOption { value: string; label: string; hint?: string; disabled?: boolean }
export interface PickGroup { label: string; options: PickOption[] }

/** Bottom-sheet picker with search and pinned groups ("Today's work" first). */
export function PickerSheet({
  open, onClose, title, groups, onPick, selected, emptyText,
}: {
  open: boolean; onClose: () => void; title: string; groups: PickGroup[]; onPick: (v: string) => void; selected?: string | null; emptyText?: string;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  useEffect(() => { if (!open) setQ(""); }, [open]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return groups
      .map((g) => ({ ...g, options: n ? g.options.filter((o) => (o.label + " " + (o.hint ?? "")).toLowerCase().includes(n)) : g.options }))
      .filter((g) => g.options.length > 0);
  }, [groups, q]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-end justify-center md:items-center" role="presentation">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label={title} className="glass relative flex max-h-[85dvh] w-full flex-col rounded-t-2xl border border-border shadow-2xl animate-fade-up md:max-w-lg md:rounded-2xl">
        <div className="border-b border-border px-4 pb-3 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg">{title}</h2>
            <button type="button" onClick={onClose} className="min-h-12 rounded-xl px-3 text-[16px] font-semibold text-muted hover:text-text cursor-pointer">Close</button>
          </div>
          <div className="flex items-center gap-2 rounded-xl border-2 border-border bg-bg px-3">
            <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label={`Search ${title}`}
              className="min-h-14 w-full bg-transparent text-[17px] outline-none placeholder:text-muted"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const first = shown.flatMap((g) => g.options).find((o) => !o.disabled);
                  if (first) { e.preventDefault(); onPick(first.value); }
                }
              }}
            />
          </div>
        </div>
        <div className="overflow-y-auto px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {shown.length === 0 && <p className="px-3 py-6 text-muted">{emptyText ?? `Nothing matches “${q}”.`}</p>}
          {shown.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h3 className="px-3 pb-1 pt-3 text-sm font-semibold uppercase tracking-wide text-muted">{g.label}</h3>
              <ul role="listbox" aria-label={g.label}>
                {g.options.map((o) => (
                  <li key={o.value} role="option" aria-selected={o.value === selected}>
                    <button
                      type="button" disabled={o.disabled} onClick={() => onPick(o.value)}
                      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-50 cursor-pointer"
                    >
                      <span className="min-w-0">
                        <span className="block text-[17px] font-medium leading-snug">{o.label}</span>
                        {o.hint && <span className="block text-sm text-muted">{o.hint}</span>}
                      </span>
                      {o.value === selected && <Check className="h-5 w-5 shrink-0 text-brand-text" aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
