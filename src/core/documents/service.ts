import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentCategory, DocumentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan, can } from "../auth/permissions";
import { demoFlag, nextCode } from "../common";
import { conflict, notFound, validation } from "../errors";
import type { Ctx } from "../types";

export const MAX_DOC_BYTES = 25 * 1024 * 1024;
export const uploadRoot = () => path.resolve(process.env.UPLOAD_DIR ?? "./.uploads");

export const DOC_CATEGORIES = ["AGREEMENT", "BOQ", "DRAWINGS", "DPR", "PURCHASE_ORDERS", "INVOICES", "QUALITY", "PAYMENT", "HANDOVER", "PHOTOS"] as const satisfies readonly DocumentCategory[];
export const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  AGREEMENT: "Agreement", BOQ: "BOQ", DRAWINGS: "Drawings", DPR: "DPR", PURCHASE_ORDERS: "Purchase orders", INVOICES: "Invoices",
  QUALITY: "Quality", PAYMENT: "Payment", HANDOVER: "Handover", PHOTOS: "Photos",
};
export const DOC_STATUS_LABEL: Record<DocumentStatus, string> = { UPLOADED: "Waiting for approval", APPROVED: "Approved", REJECTED: "Rejected", RELEASED: "Released to client" };

export const documentInput = z.object({
  category: z.enum(DOC_CATEGORIES, { errorMap: () => ({ message: "Pick the document category." }) }),
  title: z.string({ required_error: "Enter a title." }).trim().min(3, "Enter a title (a few words).").max(140),
  note: z.string().trim().max(300).nullish(),
});

/** File types by their first bytes, so a renamed file can't slip through with the wrong type. */
const TYPES = [
  { mime: "application/pdf", ext: ".pdf", check: (b: Buffer) => b.subarray(0, 5).toString() === "%PDF-" },
  { mime: "image/jpeg", ext: ".jpg", check: (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: ".png", check: (b: Buffer) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", ext: ".webp", check: (b: Buffer) => b.length > 12 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
  { mime: "image/vnd.dwg", ext: ".dwg", check: (b: Buffer) => /^AC10\d\d/.test(b.subarray(0, 6).toString("latin1")) },
  { mime: "image/vnd.dxf", ext: ".dxf", check: (b: Buffer) => /^\s*0\s*\r?\n\s*SECTION/.test(b.subarray(0, 64).toString("latin1")) },
  { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ".xlsx", check: (b: Buffer) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])), needsExt: ".xlsx" },
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ".docx", check: (b: Buffer) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])), needsExt: ".docx" },
] as const;

export function sniffDocument(buf: Buffer, fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  return TYPES.find((t) => t.check(buf) && (!("needsExt" in t) || t.needsExt === ext)) ?? null;
}

async function storeFile(projectId: string, file: { buffer: Buffer; name: string }) {
  if (file.buffer.length === 0) throw validation("That file is empty. Choose it again.");
  if (file.buffer.length > MAX_DOC_BYTES) throw validation("That file is over 25 MB. Compress it or split it and upload again.");
  const type = sniffDocument(file.buffer, file.name);
  if (!type) throw validation("Only PDF, DWG, DXF, Excel (.xlsx), Word (.docx) and JPEG, PNG or WebP files can be uploaded.");
  const key = `${randomUUID()}${type.ext}`;
  const dir = path.join(uploadRoot(), "documents", projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, key), file.buffer, { flag: "wx" });
  return { key, type, dir };
}

/** Upload a new document (version 1). The file goes to disk under a random name and is served only through an authorised route. */
export async function createDocument(ctx: Ctx, projectId: string, raw: unknown, file: { buffer: Buffer; name: string }) {
  assertCan(ctx, "create", "document", projectId);
  const i = documentInput.parse(raw);
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw notFound("That project");
  const stored = await storeFile(projectId, file);
  try {
    return await db.$transaction(async (tx) => {
      const code = await nextCode(tx, "DOC");
      const doc = await tx.document.create({
        data: {
          code, projectId, category: i.category, title: i.title, uploadedById: ctx.userId, ...demoFlag(),
          versions: { create: { version: 1, fileKey: stored.key, fileName: file.name.slice(0, 160) || "document", mimeType: stored.type.mime, sizeBytes: file.buffer.length, isCurrent: true, note: i.note || null, uploadedById: ctx.userId, ...demoFlag() } },
        },
      });
      await writeAudit(tx, ctx, { action: "UPLOAD", entity: "Document", entityId: doc.id, projectId, after: { code, category: i.category, title: i.title, version: 1 } });
      return doc.id;
    });
  } catch (e) {
    await rm(path.join(stored.dir, stored.key), { force: true });
    throw e;
  }
}

/** A new version supersedes the current one (only the latest stays CURRENT). The document goes back to "waiting for approval". */
export async function addDocumentVersion(ctx: Ctx, documentId: string, file: { buffer: Buffer; name: string }, note?: string | null) {
  const head = await db.document.findUnique({ where: { id: documentId }, select: { projectId: true } });
  if (!head) throw notFound("That document");
  assertCan(ctx, "create", "document", head.projectId);
  const stored = await storeFile(head.projectId, file);
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${documentId} FOR UPDATE`;
      const doc = await tx.document.findUniqueOrThrow({ where: { id: documentId } });
      const next = doc.currentVersion + 1;
      await tx.documentVersion.updateMany({ where: { documentId, isCurrent: true }, data: { isCurrent: false } });
      await tx.documentVersion.create({
        data: { documentId, version: next, fileKey: stored.key, fileName: file.name.slice(0, 160) || "document", mimeType: stored.type.mime, sizeBytes: file.buffer.length, isCurrent: true, note: note?.trim().slice(0, 300) || null, uploadedById: ctx.userId, ...demoFlag() },
      });
      await tx.document.update({ where: { id: documentId }, data: { currentVersion: next, status: "UPLOADED", statusNote: null, decidedById: null, decidedAt: null, releasedAt: null } });
      await writeAudit(tx, ctx, { action: "NEW_VERSION", entity: "Document", entityId: documentId, projectId: doc.projectId, before: { version: doc.currentVersion, status: doc.status }, after: { version: next, status: "UPLOADED" } });
      return next;
    });
  } catch (e) {
    await rm(path.join(stored.dir, stored.key), { force: true });
    throw e;
  }
}

/** Approve, reject (with a reason), release to the client, or withdraw from the client. Each move is claimed on the current status. */
export type DocAction = "APPROVE" | "REJECT" | "RELEASE" | "WITHDRAW";
const FROM: Record<DocAction, DocumentStatus[]> = { APPROVE: ["UPLOADED"], REJECT: ["UPLOADED"], RELEASE: ["APPROVED"], WITHDRAW: ["RELEASED"] };
const TO: Record<DocAction, DocumentStatus> = { APPROVE: "APPROVED", REJECT: "REJECTED", RELEASE: "RELEASED", WITHDRAW: "APPROVED" };

export async function decideDocument(ctx: Ctx, documentId: string, action: DocAction, reason?: string | null) {
  const head = await db.document.findUnique({ where: { id: documentId }, select: { projectId: true, status: true, code: true } });
  if (!head) throw notFound("That document");
  assertCan(ctx, "approve", "document", head.projectId);
  if (action === "REJECT" && (reason ?? "").trim().length < 3) throw validation("Say why it is rejected, so the uploader can fix it.", { reason: "Say why it is rejected." });
  if (!FROM[action].includes(head.status)) throw conflict(`${head.code} is “${DOC_STATUS_LABEL[head.status]}”, so that isn't possible now. Refresh to see its current state.`);
  await db.$transaction(async (tx) => {
    const res = await tx.document.updateMany({
      where: { id: documentId, status: { in: FROM[action] } },
      data: {
        status: TO[action], decidedById: ctx.userId, decidedAt: ctx.now, statusNote: action === "REJECT" ? reason!.trim().slice(0, 300) : null,
        releasedAt: action === "RELEASE" ? ctx.now : null,
      },
    });
    if (res.count === 0) throw conflict(`${head.code} was just changed by someone else. Refresh to see its current state.`);
    await writeAudit(tx, ctx, { action, entity: "Document", entityId: documentId, projectId: head.projectId, before: { status: head.status }, after: { status: TO[action], reason: reason ?? null } });
  });
}

const docInclude = {
  project: { select: { code: true, name: true } }, uploadedBy: { select: { name: true } },
  versions: { orderBy: { version: "desc" }, include: { uploadedBy: { select: { name: true } } } },
} satisfies Prisma.DocumentInclude;

function scope(ctx: Ctx, projectId?: string): Prisma.DocumentWhereInput {
  return {
    ...(projectId ? { projectId } : {}),
    ...(ctx.allProjects ? {} : { projectId: projectId ?? { in: [...ctx.projectIds] } }),
    ...(ctx.role === "CLIENT" ? { status: "RELEASED" as DocumentStatus } : {}), // clients see released documents only
  };
}

type DocWithVersions = Prisma.DocumentGetPayload<{ include: typeof docInclude }>;
function shape(ctx: Ctx, d: DocWithVersions) {
  const current = d.versions.find((v) => v.isCurrent) ?? d.versions[0];
  const versions = ctx.role === "CLIENT" ? d.versions.filter((v) => v.isCurrent) : d.versions;
  return {
    id: d.id, code: d.code, projectId: d.projectId, projectCode: d.project.code, projectName: d.project.name, category: d.category, title: d.title, status: d.status,
    statusNote: d.statusNote, currentVersion: d.currentVersion, uploadedBy: d.uploadedBy.name, updatedAt: d.updatedAt.toISOString(),
    fileName: current.fileName, mimeType: current.mimeType, sizeBytes: current.sizeBytes, currentVersionId: current.id,
    versions: versions.map((v) => ({ id: v.id, version: v.version, fileName: v.fileName, mimeType: v.mimeType, sizeBytes: v.sizeBytes, isCurrent: v.isCurrent, note: v.note, by: v.uploadedBy.name, at: v.createdAt.toISOString() })),
    canUpload: can(ctx, "create", "document", d.projectId), canDecide: can(ctx, "approve", "document", d.projectId),
  };
}

export async function listDocuments(ctx: Ctx, f: { projectId?: string; category?: DocumentCategory } = {}) {
  assertCan(ctx, "read", "document");
  if (f.projectId && !ctx.allProjects && !ctx.projectIds.includes(f.projectId)) return [];
  const rows = await db.document.findMany({ where: { ...scope(ctx, f.projectId), ...(f.category ? { category: f.category } : {}) }, include: docInclude, orderBy: [{ updatedAt: "desc" }], take: 200 });
  return rows.map((d) => shape(ctx, d));
}
export type DocumentRow = Awaited<ReturnType<typeof listDocuments>>[number];

export async function getDocument(ctx: Ctx, id: string) {
  assertCan(ctx, "read", "document");
  const d = await db.document.findFirst({ where: { id, ...scope(ctx) }, include: docInclude });
  if (!d) throw notFound("That document");
  return shape(ctx, d);
}

/** For the download route: the file behind a version, if the caller may see it. Clients get only the current version of a released document. */
export async function locateDocumentFile(ctx: Ctx, versionId: string) {
  assertCan(ctx, "read", "document");
  const v = await db.documentVersion.findUnique({ where: { id: versionId }, include: { document: { select: { projectId: true, status: true } } } });
  if (!v) throw notFound("That file");
  if (!ctx.allProjects && !ctx.projectIds.includes(v.document.projectId)) throw notFound("That file");
  if (ctx.role === "CLIENT" && !(v.document.status === "RELEASED" && v.isCurrent)) throw notFound("That file");
  return { file: path.join(uploadRoot(), "documents", v.document.projectId, v.fileKey), mime: v.mimeType, name: v.fileName };
}
