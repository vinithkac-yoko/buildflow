import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentDecisionButtons, DocumentVersionButton } from "@/components/ops/document-forms";
import { NoAccess } from "@/components/no-access";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AppError } from "@/core/errors";
import { CATEGORY_LABEL, DOC_STATUS_LABEL, getDocument } from "@/core/documents/service";
import { requireSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Document" };

const TONE = { UPLOADED: "warn", APPROVED: "plan", REJECTED: "danger", RELEASED: "ok" } as const;
const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function DocumentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireSession();
  let d;
  try { d = await getDocument(ctx, id); } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    if (e instanceof AppError && e.code === "FORBIDDEN") return <NoAccess />;
    throw e;
  }
  const client = ctx.role === "CLIENT";
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/documents" className="text-[15px] text-muted hover:text-text">← Documents</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl md:text-3xl">{d.title}</h1>{!client && <Badge tone={TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Badge>}</div>
        <p className="text-muted"><span className="code">{d.code}</span> · {CATEGORY_LABEL[d.category]} · {d.projectCode} {d.projectName}</p>
      </div>
      {d.status === "REJECTED" && d.statusNote && <Card><p className="font-medium">Rejected</p><p>{d.statusNote}</p></Card>}
      <Card>
        <p className="text-sm text-muted">Current version</p>
        <p className="text-[18px] font-semibold">Version {d.currentVersion} · {d.fileName} <span className="text-base font-normal text-muted">({kb(d.sizeBytes)})</span></p>
        <a href={`/api/files/document/${d.currentVersionId}`} className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-[16px] font-semibold text-brand-on hover:brightness-110">Open / download</a>
      </Card>
      {!client && (d.canDecide || d.canUpload) && (
        <div className="flex flex-wrap gap-2">
          {d.canDecide && <DocumentDecisionButtons documentId={d.id} status={d.status} />}
          {d.canUpload && <DocumentVersionButton documentId={d.id} />}
        </div>
      )}
      {!client && (
        <Card>
          <h2 className="mb-2 text-lg">Versions</h2>
          <ul className="divide-y divide-border">
            {d.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="text-[16px] font-medium">Version {v.version} {v.isCurrent && <Badge tone="ok">Current</Badge>}</p>
                  <p className="text-sm text-muted">{v.fileName} ({kb(v.sizeBytes)}) · {v.by} · {formatDateTime(v.at)}{v.note ? ` · ${v.note}` : ""}</p>
                </div>
                <a href={`/api/files/document/${v.id}`} className="inline-flex min-h-11 items-center text-[15px] font-semibold text-brand-text underline">Open</a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
