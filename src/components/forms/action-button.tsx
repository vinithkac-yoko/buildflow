"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/core/errors";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toaster";

/** One-click server action (status change, remove, link …) with optional confirmation and toast feedback. */
export function ActionButton({
  action, label, variant = "secondary", size = "md", confirm, successMessage = "Done.", className, ariaLabel,
}: {
  action: () => Promise<ActionResult<unknown>>;
  label: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg";
  confirm?: string;
  successMessage?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);

  const run = () =>
    start(async () => {
      const res = await action();
      setAsking(false);
      if (res.ok) {
        toast("success", successMessage);
        router.refresh();
      } else toast("error", res.error);
    });

  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} aria-label={ariaLabel} disabled={pending} onClick={() => (confirm ? setAsking(true) : run())}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {label}
      </Button>
      {confirm && (
        <Modal open={asking} onClose={() => setAsking(false)} title="Please confirm">
          <p className="text-[17px]">{confirm}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAsking(false)} disabled={pending}>Cancel</Button>
            <Button variant={variant === "danger" ? "danger" : "primary"} onClick={run} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Yes, continue
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
