import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { locateDocumentFile } from "@/core/documents/service";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const INLINE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

/** Documents are never served from /public: every download is checked against the caller's project access and the document's status. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  const { id } = await params;
  try {
    const { file, mime, name } = await locateDocumentFile(session.ctx, id);
    const data = await readFile(file);
    const safe = name.replace(/[^\w.\- ]+/g, "_");
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": mime, "Content-Length": String(data.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `${INLINE.has(mime) ? "inline" : "attachment"}; filename="${safe}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "That file was not found." }, { status: 404 });
  }
}
