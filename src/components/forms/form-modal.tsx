"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import type { ActionResult } from "@/core/errors";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toaster";

export interface FormApi {
  fieldErrors: Record<string, string>;
  error: string | null;
  pending: boolean;
  /** Field-level error text, ready to drop under an input. */
  err: (key: string) => React.ReactNode;
}

/**
 * A button that opens a modal with your own form body. `onSubmit` returns an ActionResult; server field errors are
 * handed to the body so they can sit next to the field. The page refreshes on success.
 */
export function FormModal({
  title, label, icon = "plus", variant = "primary", size = "md", submitLabel = "Save", successMessage = "Saved.", wide, onSubmit, children, onOpen,
}: {
  title: string; label: string; icon?: "plus" | "none"; variant?: "primary" | "secondary" | "ghost"; size?: "md" | "lg";
  submitLabel?: string; successMessage?: string; wide?: boolean;
  onSubmit: () => Promise<ActionResult<unknown>> | ActionResult<unknown>;
  children: (api: FormApi) => React.ReactNode;
  onOpen?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const close = () => { setOpen(false); setError(null); setFieldErrors({}); };
  const err = (key: string) => (fieldErrors[key] ? <p role="alert" className="mt-1 text-sm text-danger">{fieldErrors[key]}</p> : null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    start(async () => {
      const res = await onSubmit();
      if (res.ok) { toast("success", successMessage); close(); router.refresh(); }
      else { setError(res.error); setFieldErrors(res.fieldErrors ?? {}); }
    });
  };

  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => { onOpen?.(); setOpen(true); }}>
        {icon === "plus" && <Plus className="h-4 w-4" aria-hidden />}{label}
      </Button>
      <Modal open={open} onClose={close} title={title} wide={wide}>
        <form onSubmit={submit} noValidate className="space-y-4">
          {children({ fieldErrors, error, pending, err })}
          {error && !Object.values(fieldErrors).some(Boolean) && <p role="alert" className="rounded-xl border border-danger/50 px-3 py-2 text-[15px] text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{pending ? "Saving…" : submitLabel}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export const selectCls = "min-h-12 w-full rounded-xl border border-border bg-bg px-3 text-[17px]";
export const areaCls = "w-full rounded-xl border border-border bg-bg px-3 py-3 text-[17px]";
export const today = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
/** Empty text becomes undefined so the server says "Enter …" instead of reading it as zero. */
export const numOrUndef = (s: string | undefined) => (s === undefined || s.trim() === "" ? undefined : Number(s.replace(/,/g, "")));
