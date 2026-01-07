import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex h-11 w-full items-center justify-center rounded-md bg-[var(--theme-button-bg)] text-sm font-semibold text-[var(--theme-button-text)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-ring)] disabled:cursor-not-allowed disabled:opacity-70",
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = "Button";

export { Button };
