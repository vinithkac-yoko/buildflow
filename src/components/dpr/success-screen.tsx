"use client";

import Link from "next/link";

/** After submitting: a check that draws itself, and a clear next step. */
export function SuccessScreen({ pmName, projectName, queued = false }: { pmName: string | null; projectName: string; queued?: boolean }) {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-xl flex-col items-center justify-center gap-5 px-4 text-center" role="status">
      <svg viewBox="0 0 80 80" className="h-28 w-28" aria-hidden>
        <circle cx="40" cy="40" r="36" fill="none" stroke="rgb(var(--brand))" strokeWidth="5" className="dpr-check-ring" />
        <path d="M24 41 l11 11 l22 -24" fill="none" stroke="rgb(var(--brand))" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="dpr-check-mark" />
      </svg>
      <div>
        <h1 className="text-3xl">{queued ? "Report saved on your phone" : "Report sent"}</h1>
        <p className="mt-2 text-[18px]">
          {queued
            ? <>You&apos;re offline. It will go to {pmName ? <strong>{pmName}</strong> : "your Project Manager"} for approval automatically when you&apos;re back online.</>
            : pmName ? <>Sent to <strong>{pmName}</strong> for approval.</> : "Sent to your Project Manager for approval."}
        </p>
        <p className="mt-1 text-muted">{projectName}. {queued ? "You can close the app; nothing is lost." : "Progress and stock update once it is approved."}</p>
      </div>
      <Link href="/my-projects" className="flex min-h-16 w-full max-w-sm items-center justify-center rounded-xl bg-brand text-[18px] font-bold text-brand-on hover:brightness-110">
        Back to My Projects
      </Link>
      <style>{`
        .dpr-check-ring{stroke-dasharray:230;stroke-dashoffset:230;animation:dprdraw 260ms ease-out forwards}
        .dpr-check-mark{stroke-dasharray:70;stroke-dashoffset:70;animation:dprdraw 220ms 180ms ease-out forwards}
        @keyframes dprdraw{to{stroke-dashoffset:0}}
        @media (prefers-reduced-motion:reduce){.dpr-check-ring,.dpr-check-mark{animation:none;stroke-dashoffset:0}}
      `}</style>
    </div>
  );
}
