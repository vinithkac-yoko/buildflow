import { NextResponse } from "next/server";
import { AppError } from "@/core/errors";
import { addDocumentVersion } from "@/core/documents/service";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Upload a new version of an existing document; it supersedes the current one. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  const { id } = await params;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    const version = await addDocumentVersion(session.ctx, id, { buffer: Buffer.from(await file.arrayBuffer()), name: file.name }, String(form.get("note") ?? "") || null);
    return NextResponse.json({ version });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400 });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong saving that file. Try again." }, { status: 500 });
  }
}
