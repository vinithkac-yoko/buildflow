import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border", {
  variants: {
    tone: {
      ok: "border-brand-text/40 text-brand-text",
      warn: "border-warn/50 text-warn",
      danger: "border-danger/50 text-danger",
      slate: "border-slate/40 text-slate",
      plan: "border-planned/40 text-planned",
    },
  },
  defaultVariants: { tone: "slate" },
});

/** Status chips always carry an icon AND a label — pass both as children (never colour alone). */
export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}
