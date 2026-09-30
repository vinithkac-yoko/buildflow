import type { ActivityStatus, DprStatus, ProjectStatus } from "@prisma/client";
import { CheckCircle2, CirclePause, CircleDashed, CircleX, Clock, FilePen, OctagonPause, PlayCircle, RotateCcw, Send, type LucideIcon } from "lucide-react";
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

const ACTIVITY_STATUS: Record<ActivityStatus, { label: string; icon: LucideIcon; tone: "ok" | "warn" | "danger" | "slate" | "plan" }> = {
  NOT_STARTED: { label: "Not started", icon: CircleDashed, tone: "slate" },
  IN_PROGRESS: { label: "In progress", icon: PlayCircle, tone: "plan" },
  HALTED: { label: "Halted", icon: OctagonPause, tone: "warn" },
  COMPLETED: { label: "Completed", icon: CheckCircle2, tone: "ok" },
};

export function ActivityStatusChip({ status }: { status: ActivityStatus }) {
  const s = ACTIVITY_STATUS[status];
  const Icon = s.icon;
  return (
    <Badge tone={s.tone}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {s.label}
    </Badge>
  );
}

/** Today's report status as the site team sees it. `null` means no report has been started. */
const DPR_STATUS: Record<DprStatus | "NONE", { label: string; icon: LucideIcon; tone: "ok" | "warn" | "danger" | "slate" | "plan" }> = {
  NONE: { label: "Not started", icon: CircleDashed, tone: "slate" },
  DRAFT: { label: "Draft saved", icon: FilePen, tone: "plan" },
  SUBMITTED: { label: "Sent — waiting for PM", icon: Send, tone: "warn" },
  APPROVED: { label: "Approved", icon: CheckCircle2, tone: "ok" },
  REJECTED: { label: "Sent back — fix it", icon: RotateCcw, tone: "danger" },
};

export function DprStatusChip({ status, compact = false }: { status: DprStatus | null; compact?: boolean }) {
  const s = DPR_STATUS[status ?? "NONE"];
  const Icon = s.icon;
  return (
    <Badge tone={s.tone} className={compact ? "" : "px-3 py-1 text-sm"}>
      <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden />
      {s.label}
    </Badge>
  );
}
