import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan, can } from "../auth/permissions";
import { demoFlag } from "../common";
import { conflict, forbidden, notFound, validation } from "../errors";
import type { Ctx } from "../types";
import { ensureDpr } from "./service";
import { isEditable } from "./transitions";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

export const uploadRoot = () => path.resolve(process.env.UPLOAD_DIR ?? "./.uploads");

/** Look at the first bytes so a renamed file can't slip through with the wrong type. */
function sniff(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

/** Store a site photo against today's report. Files live on disk under randomised names and are served only through an authorised route. */
export async function saveDprPhoto(
  ctx: Ctx,
  projectId: string,
  file: { buffer: Buffer; name: string; type: string },
  opts: { clientTxnId?: string | null } = {},
) {
  assertCan(ctx, "create", "photo", projectId);
  if (file.buffer.length === 0) throw validation("That photo is empty. Take it again.");
  if (file.buffer.length > MAX_UPLOAD_BYTES) throw validation("That photo is over 15 MB. Take it again — the app shrinks photos, so this one may not be a normal picture.");
  const real = sniff(file.buffer);
  if (!real || !TYPES[real] || (file.type && TYPES[file.type] === undefined)) {
    throw validation("Only JPEG, PNG or WebP pictures can be added. Take a new photo with the camera.");
  }

  if (opts.clientTxnId) {
    const dup = await db.dprPhoto.findUnique({ where: { clientTxnId: opts.clientTxnId } });
    if (dup) return { id: dup.id, name: dup.originalName, sizeBytes: dup.sizeBytes };
  }
  const dpr = await ensureDpr(ctx, projectId);
  if (!isEditable(dpr.status)) throw conflict("Today's report is already submitted, so photos can't be added. Ask the PM to send it back.");

  const key = `${randomUUID()}${TYPES[real]}`;
  const dir = path.join(uploadRoot(), "dpr", projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, key), file.buffer, { flag: "wx" });

  try {
    return await db.$transaction(async (tx) => {
      const p = await tx.dprPhoto.create({
        data: {
          dprId: dpr.id, projectId, fileKey: key, originalName: file.name.slice(0, 120) || "photo", mimeType: real,
          sizeBytes: file.buffer.length, uploadedById: ctx.userId, clientTxnId: opts.clientTxnId ?? null, ...demoFlag(),
        },
      });
      await writeAudit(tx, ctx, { action: "UPLOAD", entity: "DprPhoto", entityId: p.id, projectId, after: { dprId: dpr.id, size: p.sizeBytes } });
      return { id: p.id, name: p.originalName, sizeBytes: p.sizeBytes };
    });
  } catch (e) {
    await rm(path.join(dir, key), { force: true });
    throw e;
  }
}

export async function deleteDprPhoto(ctx: Ctx, photoId: string) {
  const p = await db.dprPhoto.findUnique({ where: { id: photoId }, include: { dpr: { select: { status: true } } } });
  if (!p) throw notFound("That photo");
  assertCan(ctx, "create", "photo", p.projectId);
  if (p.uploadedById !== ctx.userId) throw forbidden("You can only remove photos you added.");
  if (!isEditable(p.dpr.status)) throw conflict("This report is already submitted, so its photos can't be removed.");
  await db.$transaction(async (tx) => {
    await tx.dprPhoto.delete({ where: { id: photoId } });
    await writeAudit(tx, ctx, { action: "DELETE", entity: "DprPhoto", entityId: photoId, projectId: p.projectId, before: { dprId: p.dprId } });
  });
  await rm(path.join(uploadRoot(), "dpr", p.projectId, p.fileKey), { force: true });
}

/** PM decides which photos the client may see. */
export async function setPhotoClientVisible(ctx: Ctx, photoId: string, visible: boolean) {
  const p = await db.dprPhoto.findUnique({ where: { id: photoId } });
  if (!p) throw notFound("That photo");
  assertCan(ctx, "update", "photo", p.projectId);
  await db.$transaction(async (tx) => {
    await tx.dprPhoto.update({ where: { id: photoId }, data: { clientVisible: visible } });
    await writeAudit(tx, ctx, {
      action: "UPDATE", entity: "DprPhoto", entityId: photoId, projectId: p.projectId,
      before: { clientVisible: p.clientVisible }, after: { clientVisible: visible },
    });
  });
}

/** Authorise and locate a photo file. Clients only get photos the PM shared on approved reports. */
export async function locateDprPhoto(ctx: Ctx, photoId: string) {
  const p = await db.dprPhoto.findUnique({ where: { id: photoId }, include: { dpr: { select: { status: true } } } });
  if (!p) throw notFound("That photo");
  if (!can(ctx, "read", "photo", p.projectId)) throw notFound("That photo");
  if (ctx.role === "CLIENT" && !(p.clientVisible && p.dpr.status === "APPROVED")) throw notFound("That photo");
  return { file: path.join(uploadRoot(), "dpr", p.projectId, p.fileKey), mime: p.mimeType, name: p.originalName };
}
