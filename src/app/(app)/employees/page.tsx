import { MasterScreen } from "@/components/masters/master-screen";

export const metadata = { title: "Employees" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  return <MasterScreen kind="employee" q={q} />;
}
