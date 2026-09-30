import { DocumentsScreen } from "@/components/documents-screen";

export const metadata = { title: "Handover" };

export default function HandoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DocumentsScreen searchParams={searchParams} fixedCategory="HANDOVER" title="Handover" />;
}
