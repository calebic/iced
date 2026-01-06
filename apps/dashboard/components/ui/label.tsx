import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const Label = ({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) => (
  <label
    className={cn("text-sm font-medium text-slate-200", className)}
    {...props}
  />
);

export { Label };
