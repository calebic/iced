import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-11 w-full rounded-md border border-[var(--theme-input-border)] bg-[var(--theme-input-bg)] px-3 text-sm text-[var(--theme-input-text)] placeholder:text-[var(--theme-input-placeholder)] focus:border-[var(--theme-input-border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-ring)]",
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = "Input";

export { Input };
