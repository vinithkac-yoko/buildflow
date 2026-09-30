import { StockScreen } from "@/components/stock-screen";

export const metadata = { title: "Stock" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const project = Array.isArray(sp.project) ? sp.project[0] : sp.project;
  return <StockScreen projectId={project} />;
}
