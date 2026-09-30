import { DocumentsScreen } from "@/components/documents-screen";

export const metadata = { title: "Documents" };

export default function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DocumentsScreen searchParams={searchParams} />;
}
