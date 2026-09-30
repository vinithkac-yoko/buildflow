"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import type { ActionResult } from "@/core/errors";
import type { FieldDef, Option, Values } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toaster";
import { EntityForm } from "./entity-form";

/** A button that opens a form in a modal. `action` is a (bound) server action; the page refreshes on success. */
export function ModalForm({
  title, label, icon = "plus", variant = "primary", size = "md", fields, initial = {}, options = {}, action, submitLabel, successMessage = "Saved.", wide, ariaLabel, hiddenKeys = [],
}: {
  title: string;
  label: string;
  icon?: "plus" | "edit" | "none";
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  fields: FieldDef[];
  initial?: Values;
  options?: Record<string, Option[]>;
  action: (values: Values) => Promise<ActionResult<unknown>>;
  submitLabel?: string;
  successMessage?: string;
  wide?: boolean;
  ariaLabel?: string;
  /** Keys in `initial` that are not form fields but are still sent with the submission (e.g. a parent id). */
  hiddenKeys?: string[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)} aria-label={ariaLabel}>
        {icon === "plus" && <Plus className="h-4 w-4" aria-hidden />}
        {icon === "edit" && <Pencil className="h-4 w-4" aria-hidden />}
        {label}
      </Button>
      <Modal open={open} onClose={close} title={title} wide={wide}>
        <EntityForm
          fields={fields}
          initial={initial}
          options={options}
          submitLabel={submitLabel}
          onSubmit={async (v) => {
            const extra: Values = {};
            for (const k of hiddenKeys) if (initial[k] !== undefined) extra[k] = initial[k];
            const res = await action({ ...v, ...extra });
            if (res.ok) {
              toast("success", successMessage);
              router.refresh();
            }
            return res;
          }}
          onDone={close}
        />
      </Modal>
    </>
  );
}
