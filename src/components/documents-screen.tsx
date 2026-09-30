import Link from "next/link";
import { FileText } from "lucide-react";
import type { DocumentCategory } from "@prisma/client";
import { can } from "@/core/auth/permissions";
import { CATEGORY_LABEL, DOC_CATEGORIES, DOC_STATUS_LABEL, listDocuments } from "@/core/documents/service";
import { listProjects } from "@/core/projects/service";
import { DocumentUploadButton } from "@/components/ops/document-forms";
import { Badge } from "@/components/ui/badge";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

const TONE = { UPLOADED: "warn", APPROVED: "plan", REJECTED: "danger", RELEASED: "ok" } as const;
const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export async function DocumentsScreen({ searchParams, fixedCategory, title = "Documents" }: { searchParams: Promise<Record<string, string | string[] | undefined>>; fixedCategory?: DocumentCategory; title?: string }) {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "document")) return <NoAccess />;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const projectId = one(sp.project);
  const asked = one(sp.category);
  const category = fixedCategory ?? ((DOC_CATEGORIES as readonly string[]).includes(asked ?? "") ? (asked as DocumentCategory) : undefined);
  const [docs, projects] = await Promise.all([listDocuments(ctx, { projectId, category }), listProjects(ctx)]);
  const canUpload = can(ctx, "create", "document");
  const uploadProjects = projects.filter((p) => p.status !== "CANCELLED").map((p) => ({ id: p.id, code: p.code, name: p.name }));
  const client = ctx.role === "CLIENT";
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl md:text-3xl">{title}</h1><p className="text-muted">{client ? "Documents your project team has released to you." : "Project documents. A new upload replaces the current version; older versions stay viewable."}</p></div>
        {canUpload && uploadProjects.length > 0 && <DocumentUploadButton projects={uploadProjects} defaultProjectId={projectId} categories={DOC_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />}
      </div>
      {!fixedCategory && (
        <form method="get" className="flex flex-wrap gap-2">
          {projects.length > 1 && (
            <select name="project" defaultValue={projectId ?? ""} aria-label="Project" className="min-h-12 rounded-xl border border-border bg-bg px-3 text-[16px]"><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select>
          )}
          <select name="category" defaultValue={category ?? ""} aria-label="Category" className="min-h-12 rounded-xl border border-border bg-bg px-3 text-[16px]"><option value="">All categories</option>{DOC_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select>
          <button type="submit" className="min-h-12 rounded-xl border border-border bg-surface-2 px-4 text-[15px] font-semibold hover:brightness-110">Filter</button>
        </form>
      )}
      {docs.length === 0 ? <Card className="flex items-start gap-3"><FileText className="mt-0.5 h-6 w-6 shrink-0 text-muted" aria-hidden /><p>{client ? "Nothing has been released to you yet." : "No documents yet."}</p></Card> : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><Link href={`/documents/${d.id}`} className="inline-flex min-h-11 items-center text-[18px] font-semibold underline-offset-2 hover:underline">{d.title}</Link> <span className="code text-sm text-muted">{d.code}</span></span>
                {!client && <Badge tone={TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-muted">{CATEGORY_LABEL[d.category]} · {d.projectCode} · version {d.currentVersion} · {d.fileName} ({kb(d.sizeBytes)}) · updated {formatDate(d.updatedAt)}</p>
              <a href={`/api/files/document/${d.currentVersionId}`} className="mt-2 inline-flex min-h-11 items-center text-[15px] font-semibold text-brand-text underline">Open current version</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
