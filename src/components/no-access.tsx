import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";

export function NoAccess({ message = "You don't have access to this screen. Ask the Owner or Admin if you need it." }: { message?: string }) {
  return (
    <Card className="mx-auto max-w-xl flex items-start gap-3">
      <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
      <p>{message}</p>
    </Card>
  );
}
