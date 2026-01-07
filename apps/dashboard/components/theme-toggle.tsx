"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  getInitialTheme,
  setStoredTheme,
  type ThemePreference,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const ThemeToggle = ({ className }: { className?: string }) => {
  const [theme, setTheme] = useState<ThemePreference | null>(null);

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const toggleTheme = () => {
    if (!theme) return;
    const nextTheme: ThemePreference = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    setStoredTheme(nextTheme);
    applyTheme(nextTheme);
  };

  const label = theme === "dark" ? "Dark" : "Light";
  const icon = theme === "dark" ? "🌙" : "☀️";

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      aria-pressed={theme === "dark"}
      onClick={toggleTheme}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-md border border-[var(--theme-border)] bg-[var(--theme-toggle-bg)] px-3 text-sm font-semibold text-[var(--theme-toggle-text)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-ring)]",
        className,
      )}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
};

export default ThemeToggle;
