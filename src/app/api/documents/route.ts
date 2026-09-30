import { NextResponse } from "next/server";
import { AppError } from "@/core/errors";
import { createDocument } from "@/core/documents/service";
import { getSession } from "@/lib/auth";
import { ZodError } from "zod";

export const dynamic = "force-dynamic";

/** Upload a new document: multipart with projectId, category, title, note and file. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    const id = await createDocument(
      session.ctx, String(form.get("projectId") ?? ""),
      { category: form.get("category"), title: form.get("title"), note: form.get("note") || null },
      { buffer: Buffer.from(await file.arrayBuffer()), name: file.name },
    );
    return NextResponse.json({ id });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message, fieldErrors: e.fieldErrors }, { status: e.code === "FORBIDDEN" ? 403 : 400 });
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Check the form.", fieldErrors: Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message])) }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong saving that file. Try again." }, { status: 500 });
  }
}
