import { NextResponse } from "next/server";
import { AppError } from "@/core/errors";
import { saveDprPhoto } from "@/core/dpr/photos";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Multipart upload of one site photo. Everything is checked in the service (role, project, type, size). */
export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  const { projectId } = await params;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No photo was sent. Take it again." }, { status: 400 });
    const clientTxnId = typeof form.get("clientTxnId") === "string" ? String(form.get("clientTxnId")) : null;
    const saved = await saveDprPhoto(session.ctx, projectId, { buffer: Buffer.from(await file.arrayBuffer()), name: file.name, type: file.type }, { clientTxnId });
    return NextResponse.json(saved);
  } catch (e) {
    if (e instanceof AppError) {
      const status = e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : e.code === "CONFLICT" ? 409 : 400;
      return NextResponse.json({ error: e.message }, { status });
    }
    console.error(e);
    return NextResponse.json({ error: "The photo couldn't be saved. Try again." }, { status: 500 });
  }
}
