import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors duration-fast cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 select-none",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-on hover:brightness-110",
        secondary: "bg-surface-2 text-text border border-border hover:brightness-110",
        ghost: "text-text hover:bg-surface-2",
        danger: "bg-danger text-white hover:brightness-110",
      },
      size: {
        md: "min-h-11 px-4 text-[15px]",
        lg: "min-h-14 px-5 text-[17px]", // ≥56px field target
        xl: "min-h-16 px-6 text-lg w-full", // 64px primary action bar
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, ...props },
  ref,
) {
  return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
