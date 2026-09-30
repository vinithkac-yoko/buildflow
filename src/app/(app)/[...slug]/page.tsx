import { notFound } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { findNavItem } from "@/config/navigation";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";

export default async function PlaceholderPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const { user } = await requireSession();
  const item = findNavItem(user.role, "/" + slug.join("/"));
  if (!item) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl md:text-3xl">{item.label}</h1>
      <Card className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-planned" aria-hidden />
        <div>
          <p className="font-medium">Coming in a later release.</p>
          <p className="text-muted">{item.blurb}</p>
        </div>
      </Card>
    </div>
  );
}
