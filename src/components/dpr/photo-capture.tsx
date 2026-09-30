"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, RotateCw, TriangleAlert, X, CheckCircle2 } from "lucide-react";
import { deletePhotoAction } from "@/actions/dpr";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

const TARGET_BYTES = 300 * 1024;
const MAX_DIMENSION = 1600;

/** Shrink a camera photo to about 300 KB on the phone so it uploads quickly on patchy data. */
export async function compressImage(file: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // unsupported format: let the server decide
  }
  let scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  let quality = 0.82;
  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (blob && (blob.size <= TARGET_BYTES || attempt === 7)) {
      bitmap.close?.();
      return blob;
    }
    if (quality > 0.5) quality -= 0.12;
    else scale *= 0.8;
  }
  bitmap.close?.();
  return file;
}

export interface PhotoStats { saved: number; uploading: number; failed: number }
const statsOf = (t: { state: string }[]): PhotoStats => ({
  saved: t.filter((x) => x.state === "saved").length, uploading: t.filter((x) => x.state === "uploading").length, failed: t.filter((x) => x.state === "failed").length,
});

interface Tile { key: string; id?: string; name: string; size: number; preview: string; state: "uploading" | "saved" | "failed"; blob?: Blob; error?: string }

/** Camera button plus thumbnails with a per-photo upload state (Uploading → Saved, or Failed → retry). */
export function PhotoCapture({
  projectId, initial, disabled, onStats,
}: { projectId: string; initial: { id: string; name: string; sizeBytes: number }[]; disabled?: boolean; onStats?: (s: PhotoStats) => void }) {
  const [tiles, setTiles] = useState<Tile[]>(() =>
    initial.map((p) => ({ key: p.id, id: p.id, name: p.name, size: p.sizeBytes, preview: `/api/files/dpr-photo/${p.id}`, state: "saved" as const })),
  );
  const input = useRef<HTMLInputElement>(null);

  const update = (key: string, patch: Partial<Tile>) =>
    setTiles((cur) => {
      const next = cur.map((t) => (t.key === key ? { ...t, ...patch } : t));
      onStats?.(statsOf(next));
      return next;
    });

  async function upload(key: string, blob: Blob, name: string) {
    update(key, { state: "uploading", error: undefined });
    try {
      const form = new FormData();
      form.set("file", new File([blob], name.replace(/\.[^.]+$/, "") + ".jpg", { type: blob.type || "image/jpeg" }));
      form.set("clientTxnId", key);
      const res = await fetch(`/api/dpr/${projectId}/photos`, { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "The photo couldn't be saved.");
      update(key, { id: data.id, state: "saved", blob: undefined });
    } catch (e) {
      update(key, { state: "failed", error: e instanceof Error && e.message !== "Failed to fetch" ? e.message : "No signal. Tap to try again.", blob });
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const key = crypto.randomUUID();
      const blob = await compressImage(file);
      setTiles((cur) => [...cur, { key, name: file.name || "photo.jpg", size: blob.size, preview: URL.createObjectURL(blob), state: "uploading", blob }]);
      void upload(key, blob, file.name || "photo.jpg");
    }
    if (input.current) input.current.value = "";
  }

  async function remove(t: Tile) {
    if (t.id) {
      const res = await deletePhotoAction(t.id);
      if (!res.ok) return toast("error", res.error);
    }
    setTiles((cur) => {
      const next = cur.filter((x) => x.key !== t.key);
      onStats?.(statsOf(next));
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <input ref={input} type="file" accept="image/*" capture="environment" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onFiles(e.target.files)} />
      <button
        type="button" disabled={disabled} onClick={() => input.current?.click()}
        className="flex min-h-16 w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-brand-text/60 bg-bg text-[18px] font-semibold text-brand-text hover:bg-surface-2 disabled:opacity-50 cursor-pointer"
      >
        <Camera className="h-7 w-7" aria-hidden /> Take photo
      </button>
      {tiles.length > 0 && (
        <ul className="grid grid-cols-3 gap-2" aria-label="Photos in this report">
          {tiles.map((t) => (
            <li key={t.key} className="relative overflow-hidden rounded-xl border border-border bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.preview} alt={t.name} className="aspect-square w-full object-cover" />
              <div
                className={cn(
                  "absolute inset-x-0 bottom-0 flex items-center gap-1 px-1.5 py-1 text-xs font-semibold text-white",
                  t.state === "failed" ? "bg-danger" : t.state === "uploading" ? "bg-black/70" : "bg-black/60",
                )}
              >
                {t.state === "uploading" && <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Uploading</>}
                {t.state === "saved" && <><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Saved</>}
                {t.state === "failed" && <><TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Failed</>}
              </div>
              {t.state === "failed" && t.blob && (
                <button type="button" onClick={() => void upload(t.key, t.blob!, t.name)} aria-label="Try uploading again" className="absolute inset-0 grid place-items-center bg-black/40 text-white cursor-pointer">
                  <RotateCw className="h-7 w-7" aria-hidden />
                </button>
              )}
              {!disabled && t.state !== "uploading" && (
                <button type="button" onClick={() => void remove(t)} aria-label={`Remove photo ${t.name}`} className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-white cursor-pointer">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-black/60"><X className="h-4 w-4" aria-hidden /></span>
                </button>
              )}
              {t.state === "failed" && t.error && <p className="sr-only">{t.error}</p>}
            </li>
          ))}
        </ul>
      )}
      {tiles.some((t) => t.state === "failed") && (
        <p role="status" className="text-[15px] text-warn">Some photos haven&apos;t reached the server yet. Tap a photo to try again. If you submit now, those photos will not be included.</p>
      )}
    </div>
  );
}
