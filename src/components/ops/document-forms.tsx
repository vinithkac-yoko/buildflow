"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { decideDocumentAction } from "@/actions/ops";
import { ActionButton } from "@/components/forms/action-button";
import { FormModal, areaCls, selectCls } from "@/components/forms/form-modal";
import { Input, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";

interface Opt { value: string; label: string }
const ACCEPT = ".pdf,.dwg,.dxf,.xlsx,.docx,.jpg,.jpeg,.png,.webp";

/** POST a file to one of our upload routes and turn the reply into an ActionResult. */
async function upload(url: string, form: FormData) {
  try {
    const res = await fetch(url, { method: "POST", body: form });
    const body = (await res.json().catch(() => ({}))) as { error?: string; fieldErrors?: Record<string, string> };
    if (res.ok) return { ok: true as const };
    return { ok: false as const, error: body.error ?? "That didn't work. Try again.", fieldErrors: body.fieldErrors };
  } catch {
    return { ok: false as const, error: "Could not reach the server. Check your connection and try again." };
  }
}

export function DocumentUploadButton({ projects, categories, defaultProjectId }: { projects: { id: string; code: string; name: string }[]; categories: Opt[]; defaultProjectId?: string }) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? "");
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  return (
    <FormModal title="Upload a document" label="Upload a document" submitLabel="Upload" successMessage="Document uploaded."
      onSubmit={async () => {
        if (!file) return { ok: false, error: "Choose a file to upload.", fieldErrors: { file: "Choose a file to upload." } };
        const form = new FormData();
        form.set("projectId", projectId); form.set("category", category); form.set("title", title); form.set("note", note); form.set("file", file);
        const r = await upload("/api/documents", form);
        if (r.ok) { setTitle(""); setNote(""); setFile(null); }
        return r;
      }}>
      {({ err }) => (
        <>
          {projects.length > 1 && (
            <div><Label htmlFor="up-project">Project</Label>
              <select id="up-project" className={selectCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></div>
          )}
          <div><Label htmlFor="up-cat">Category <span className="text-danger">*</span></Label>
            <select id="up-cat" className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Select…</option>{categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>{err("category")}</div>
          <div><Label htmlFor="up-title">Title <span className="text-danger">*</span></Label><Input id="up-title" value={title} onChange={(e) => setTitle(e.target.value)} />{err("title")}</div>
          <div><Label htmlFor="up-file">File <span className="text-danger">*</span></Label>
            <input id="up-file" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block min-h-12 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-[16px]" />
            <p className="mt-1 text-sm text-muted">PDF, DWG, DXF, Excel, Word or a picture, up to 25 MB.</p>{err("file")}</div>
          <div><Label htmlFor="up-note">Note (optional)</Label><Input id="up-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </>
      )}
    </FormModal>
  );
}

export function DocumentVersionButton({ documentId }: { documentId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  return (
    <FormModal title="Upload a new version" label="Upload a new version" icon="none" variant="secondary" submitLabel="Upload version" successMessage="New version uploaded. It needs approval again."
      onSubmit={async () => {
        if (!file) return { ok: false, error: "Choose a file to upload.", fieldErrors: { file: "Choose a file to upload." } };
        const form = new FormData();
        form.set("file", file); form.set("note", note);
        const r = await upload(`/api/documents/${documentId}/versions`, form);
        if (r.ok) { setFile(null); setNote(""); }
        return r;
      }}>
      {({ err }) => (
        <>
          <p className="text-[15px] text-muted">The new file replaces the current one for everyone. The old version stays viewable, and the document goes back to “waiting for approval”.</p>
          <div><Label htmlFor="nv-file">File <span className="text-danger">*</span></Label>
            <input id="nv-file" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block min-h-12 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-[16px]" />{err("file")}</div>
          <div><Label htmlFor="nv-note">What changed?</Label><textarea id="nv-note" rows={2} className={areaCls} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </>
      )}
    </FormModal>
  );
}

export function DocumentDecisionButtons({ documentId, status }: { documentId: string; status: "UPLOADED" | "APPROVED" | "REJECTED" | "RELEASED" }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-wrap gap-2">
      {status === "UPLOADED" && (
        <>
          <ActionButton size="lg" label="Approve" successMessage="Document approved." action={() => decideDocumentAction(documentId, "APPROVE")} />
          <FormModal title="Reject this document" label="Reject" icon="none" variant="secondary" size="lg" submitLabel="Reject" successMessage="Document rejected."
            onSubmit={async () => { const r = await decideDocumentAction(documentId, "REJECT", reason); if (r.ok) setReason(""); else if (!r.fieldErrors) toast("error", r.error); return r; }}>
            {({ err }) => <div><Label htmlFor="rj-reason">Why is it rejected?</Label><textarea id="rj-reason" rows={3} className={areaCls} value={reason} onChange={(e) => setReason(e.target.value)} />{err("reason")}</div>}
          </FormModal>
        </>
      )}
      {status === "APPROVED" && <ActionButton size="lg" label="Release to client" confirm="Release this document? The client will be able to see and download it." successMessage="Released to the client." action={() => decideDocumentAction(documentId, "RELEASE")} />}
      {status === "RELEASED" && <ActionButton size="lg" variant="secondary" label="Withdraw from client" confirm="Withdraw this document? The client will no longer see it." successMessage="Withdrawn from the client." action={async () => { const r = await decideDocumentAction(documentId, "WITHDRAW"); router.refresh(); return r; }} />}
    </div>
  );
}
