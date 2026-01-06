import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card-bg)] p-8 shadow-[var(--theme-card-shadow)]",
      className,
    )}
    {...props}
  />
);

const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("space-y-2", className)} {...props} />
);

const CardTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn("text-2xl font-semibold", className)} {...props} />
);

const CardDescription = ({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("text-sm text-[var(--theme-muted)]", className)} {...props} />
);

const CardContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("space-y-6", className)} {...props} />
);

export { Card, CardContent, CardDescription, CardHeader, CardTitle };
