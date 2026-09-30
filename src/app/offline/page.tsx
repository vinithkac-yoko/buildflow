import { CloudOff } from "lucide-react";

export const metadata = { title: "Offline" };

/** Shown when a page was never opened on this phone while online. Public, so the service worker can keep it ready. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 py-10">
      <CloudOff className="h-10 w-10 text-muted" aria-hidden />
      <h1 className="text-2xl">You&apos;re offline</h1>
      <p className="text-[17px]">This screen wasn&apos;t saved on your phone yet. Anything you already opened while you had a signal still works — your daily report, material request and issues.</p>
      <p className="text-[17px]">What you enter is saved on the phone and will be sent automatically when you&apos;re back online.</p>
      {/* Plain links on purpose: a full page load goes through the service worker, which knows what is saved. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/dpr" className="flex min-h-16 items-center justify-center rounded-xl bg-brand text-[18px] font-bold text-brand-on">Open today&apos;s report</a>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/my-projects" className="flex min-h-14 items-center justify-center rounded-xl border-2 border-border text-[17px] font-semibold">My projects</a>
    </main>
  );
}
