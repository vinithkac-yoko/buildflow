"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { approveDprAction, rejectDprAction } from "@/actions/dpr";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toaster";

/**
 * PM decision buttons. Approving posts progress, labour and stock in one step; if stock is short the exact
 * shortage is shown here and stays on screen. Keyboard: A approves, R sends back.
 */
export function ApproveControls({ dprId, effects, nextHref }: { dprId: string; effects: string; nextHref: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const busy = useRef(false);

  const approve = () =>
    start(async () => {
      busy.current = true;
      setError(null);
      const res = await approveDprAction(dprId);
      busy.current = false;
      setConfirming(false);
      if (res.ok) {
        toast("success", `Approved. ${res.data?.activitiesUpdated ?? 0} activities updated${res.data?.ledgerEntries ? `, ${res.data.ledgerEntries} stock entries posted` : ""}.`);
        router.push(nextHref ?? "/progress");
        router.refresh();
      } else setError(res.error);
    });

  const reject = () =>
    start(async () => {
      setReasonError(null);
      const res = await rejectDprAction(dprId, { reason });
      if (res.ok) {
        setRejecting(false);
        toast("success", "Sent back to the engineer.");
        router.push(nextHref ?? "/progress");
        router.refresh();
      } else setReasonError(res.fieldErrors?.reason ?? res.error);
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || busy.current || confirming || rejecting) return;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.key.toLowerCase() === "a") setConfirming(true);
      if (e.key.toLowerCase() === "r") setRejecting(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, rejecting]);

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="flex gap-3 rounded-xl border-2 border-danger p-4">
          <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="font-semibold text-danger">Can&apos;t approve yet</p>
            <p className="mt-1 text-[16px]">{error}</p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button size="lg" onClick={() => setConfirming(true)} disabled={pending}>
          <CheckCircle2 className="h-5 w-5" aria-hidden /> Approve &amp; update progress
        </Button>
        <Button size="lg" variant="secondary" onClick={() => setRejecting(true)} disabled={pending}>
          <RotateCcw className="h-5 w-5" aria-hidden /> Send back
        </Button>
        <p className="hidden items-center text-sm text-muted md:flex">Keyboard: <kbd className="mx-1 rounded border border-border px-1.5 code">A</kbd> approve · <kbd className="mx-1 rounded border border-border px-1.5 code">R</kbd> send back</p>
      </div>

      <Modal open={confirming} onClose={() => setConfirming(false)} title="Approve this report?">
        <p className="text-[17px]">{effects}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>Cancel</Button>
          <Button onClick={approve} disabled={pending} data-autofocus>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Approve &amp; update progress
          </Button>
        </div>
      </Modal>

      <Modal open={rejecting} onClose={() => setRejecting(false)} title="Send back to the engineer">
        <label htmlFor="reject-reason" className="mb-1.5 block text-[15px] font-medium">What should they fix?</label>
        <textarea
          id="reject-reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus
          className={`w-full rounded-xl border bg-bg px-4 py-3 text-[17px] ${reasonError ? "border-danger" : "border-border"}`}
        />
        {reasonError && <p role="alert" className="mt-1 text-sm text-danger">{reasonError}</p>}
        <p className="mt-2 text-sm text-muted">Nothing is posted. The engineer sees your note, fixes the report and submits again.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRejecting(false)} disabled={pending}>Cancel</Button>
          <Button variant="danger" onClick={reject} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Send back
          </Button>
        </div>
      </Modal>
    </div>
  );
}
