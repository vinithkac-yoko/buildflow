import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { locateDprPhoto } from "@/core/dpr/photos";
import { AppError } from "@/core/errors";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Photos are never served from /public: every request is checked against the caller's project access. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  const { id } = await params;
  try {
    const { file, mime } = await locateDprPhoto(session.ctx, id);
    const data = await readFile(file);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(data.length),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: "That photo was not found." }, { status: 404 });
    return NextResponse.json({ error: "That photo was not found." }, { status: 404 });
  }
}
