import { Eye, EyeOff } from "lucide-react";
import { setPhotoVisibleAction } from "@/actions/dpr";
import { can } from "@/core/auth/permissions";
import { listPhotos } from "@/core/dpr/photos";
import { ActionButton } from "@/components/forms/action-button";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Photos" };

export default async function PhotosPage() {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "photo")) return <NoAccess />;
  const photos = await listPhotos(ctx);
  const canShare = can(ctx, "update", "photo");
  const team = ctx.role === "SITE_ENGINEER";
  const client = ctx.role === "CLIENT";
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl">Photos</h1>
        <p className="text-muted">{client ? "Photos from your site that your project manager has shared." : team ? "Photos from today’s report. Add more from your daily report." : "Recent site photos. Clients only see the ones you share, once the report is approved."}</p>
      </div>
      {photos.length === 0 ? (
        <Card><p className="font-medium">No photos yet.</p><p className="text-muted">{client ? "Photos appear here once your project manager shares them." : "Take photos in your daily report and they appear here."}</p></Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {photos.map((p) => (
            <li key={p.id} className="panel space-y-1 overflow-hidden p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <a href={`/api/files/dpr-photo/${p.id}`} target="_blank" rel="noreferrer"><img src={`/api/files/dpr-photo/${p.id}`} alt={`${p.projectCode} photo, ${formatDate(p.date)}`} className="aspect-square w-full rounded-lg object-cover" loading="lazy" /></a>
              <p className="px-1 text-sm text-muted"><span className="code">{p.projectCode}</span> · {formatDate(p.date)}</p>
              {canShare && (
                <ActionButton variant="ghost" className="w-full text-sm"
                  label={<>{p.clientVisible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />} {p.clientVisible ? "Hide from client" : "Show to client"}</>}
                  action={setPhotoVisibleAction.bind(null, p.id, !p.clientVisible)} successMessage={p.clientVisible ? "Hidden from the client." : "Shared with the client."} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
