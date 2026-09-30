import { notFound } from "next/navigation";
import { MasterScreen } from "@/components/masters/master-screen";
import { getMaster } from "@/core/masters/registry";

type SP = Record<string, string | string[] | undefined>;

export default async function MasterKindPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<SP> }) {
  const { kind } = await params;
  if (!getMaster(kind)) notFound();
  const sp = await searchParams;
  const q = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  return <MasterScreen kind={kind} q={q} backHref="/masters" />;
}
