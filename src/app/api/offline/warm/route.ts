import { NextResponse } from "next/server";
import { listProjects } from "@/core/projects/service";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** The screens the phone should keep for use without a signal: the Site Engineer's own reports and forms. */
export async function GET() {
  const session = await getSession();
  if (!session || session.user.role !== "SITE_ENGINEER") return NextResponse.json({ urls: [] });
  const projects = (await listProjects(session.ctx)).filter((p) => p.status === "ACTIVE" || p.status === "DELAYED");
  const urls = ["/my-projects", "/todays-work", "/more", "/materials", "/requests", "/requests/new", "/issues", "/quality", "/inspections/request", "/photos", ...projects.map((p) => `/dpr/${p.id}`)];
  return NextResponse.json({ urls });
}
