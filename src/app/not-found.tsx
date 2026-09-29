import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md p-8 text-center space-y-3">
      <h1 className="text-2xl">We couldn&apos;t find that page.</h1>
      <p className="text-muted">It may have moved, or you may not have access to it.</p>
      <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-brand-text">Go to your home screen</Link>
    </div>
  );
}
