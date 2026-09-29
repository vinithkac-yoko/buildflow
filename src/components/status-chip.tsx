import type { ProjectStatus } from "@prisma/client";
import { CheckCircle2, CirclePause, CircleDashed, CircleX, Clock, PlayCircle, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const PROJECT_STATUS: Record<ProjectStatus, { label: string; icon: LucideIcon; tone: "ok" | "warn" | "danger" | "slate" | "plan" }> = {
  PLANNING: { label: "Planning", icon: CircleDashed, tone: "slate" },
  ACTIVE: { label: "Active", icon: PlayCircle, tone: "ok" },
  ON_HOLD: { label: "On hold", icon: CirclePause, tone: "slate" },
  DELAYED: { label: "Delayed", icon: Clock, tone: "danger" },
  COMPLETED: { label: "Completed", icon: CheckCircle2, tone: "plan" },
  CANCELLED: { label: "Cancelled", icon: CircleX, tone: "slate" },
};

/** Status chips always pair an icon with a label — never colour alone. */
export function ProjectStatusChip({ status }: { status: ProjectStatus }) {
  const s = PROJECT_STATUS[status];
  const Icon = s.icon;
  return (
    <Badge tone={s.tone}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {s.label}
    </Badge>
  );
}

export function DemoBadge() {
  return (
    <span className="rounded border border-warn/50 px-1.5 py-px text-[10px] font-semibold tracking-wide text-warn" title="Demo data">
      DEMO
    </span>
  );
}
