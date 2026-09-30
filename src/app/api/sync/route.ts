import { NextResponse } from "next/server";
import { processSyncItem, SYNC_TYPES, type SyncItem } from "@/core/sync/service";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The phone's outbox lands here, one record at a time and in the order it was made (JSON), or one photo (multipart).
 * Each record is applied by the same service the online screen uses and answered with its own result.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData();
      const meta = JSON.parse(String(form.get("meta") ?? "{}")) as SyncItem;
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ results: [{ clientTxnId: meta.clientTxnId, status: "error", message: "The photo file didn't arrive. Take it again." }] });
      const result = await processSyncItem(session.ctx, { ...meta, type: "photo" }, { buffer: Buffer.from(await file.arrayBuffer()), name: file.name, type: file.type });
      return NextResponse.json({ results: [result] });
    }
    const body = (await req.json()) as { items?: SyncItem[] };
    const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
    const results = [];
    for (const item of items) {
      if (!item || typeof item.clientTxnId !== "string" || !SYNC_TYPES.includes(item.type)) {
        results.push({ clientTxnId: String(item?.clientTxnId ?? ""), status: "error", message: "That record isn't in a form the server understands." });
        continue;
      }
      results.push(await processSyncItem(session.ctx, item)); // in order; one item's refusal never blocks the next
    }
    return NextResponse.json({ results });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "The server had a problem. Your records are safe on the phone and will be sent again." }, { status: 500 });
  }
}
