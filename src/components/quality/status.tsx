import type { InspectionOutcome, NcrSeverity, NcrStatus } from "@prisma/client";
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDashed, ClipboardCheck, Hammer, Info, Search, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NCR_STATUS_LABEL, RESULT_LABEL } from "@/core/quality/calc";

export const ResultChip = ({ result }: { result: InspectionOutcome | null }) =>
  result === "PASS" ? <Badge tone="ok"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />{RESULT_LABEL.PASS}</Badge>
    : result === "CONDITIONAL_PASS" ? <Badge tone="warn"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />{RESULT_LABEL.CONDITIONAL_PASS}</Badge>
    : result === "REJECTED_NCR" ? <Badge tone="danger"><XCircle className="h-3.5 w-3.5" aria-hidden />Rejected — NCR</Badge>
    : <Badge tone="slate"><CircleDashed className="h-3.5 w-3.5" aria-hidden />Waiting for inspector</Badge>;

export const SeverityChip = ({ severity }: { severity: NcrSeverity }) =>
  severity === "CRITICAL" ? <Badge tone="danger"><AlertOctagon className="h-3.5 w-3.5" aria-hidden />Critical</Badge>
    : severity === "MAJOR" ? <Badge tone="warn"><ShieldAlert className="h-3.5 w-3.5" aria-hidden />Major</Badge>
    : <Badge tone="slate"><Info className="h-3.5 w-3.5" aria-hidden />Minor</Badge>;

export const NcrStatusChip = ({ status }: { status: NcrStatus }) => {
  const label = NCR_STATUS_LABEL[status];
  return status === "CLOSED" ? <Badge tone="ok"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />{label}</Badge>
    : status === "REINSPECTION" ? <Badge tone="plan"><Search className="h-3.5 w-3.5" aria-hidden />{label}</Badge>
    : status === "RECTIFICATION" ? <Badge tone="warn"><Hammer className="h-3.5 w-3.5" aria-hidden />{label}</Badge>
    : status === "CORRECTIVE_ACTION" ? <Badge tone="plan"><ClipboardCheck className="h-3.5 w-3.5" aria-hidden />{label}</Badge>
    : <Badge tone="danger"><CircleDashed className="h-3.5 w-3.5" aria-hidden />{label}</Badge>;
};

export const STEP_LABEL: Record<string, string> = {
  RAISED: "NCR raised", CORRECTIVE_ACTION: "Corrective action agreed", RECTIFICATION: "Rectification done", REINSPECTION_REQUESTED: "Reinspection requested",
  REINSPECTION_FAILED: "Reinspection failed", CLOSED: "Closed", REWORK_COST: "Rework cost recorded",
};
