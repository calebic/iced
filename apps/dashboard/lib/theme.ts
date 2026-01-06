export type ThemePreference = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

export const getStoredTheme = (): ThemePreference | null => {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
};

export const getSystemTheme = (): ThemePreference =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export const applyTheme = (theme: ThemePreference) => {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
};

export const setStoredTheme = (theme: ThemePreference) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
};

export const getInitialTheme = (): ThemePreference => {
  if (typeof document !== "undefined") {
    if (document.documentElement.classList.contains("dark")) {
      return "dark";
    }
  }
  return getStoredTheme() ?? getSystemTheme();
};
