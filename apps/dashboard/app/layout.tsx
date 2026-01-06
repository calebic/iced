import type { ReactNode } from "react";
import Script from "next/script";
import { getValidatedApiBaseUrl } from "@/lib/api-config";
import { checkApiHealth } from "@/lib/api-health";
import "./globals.css";

export const metadata = {
  title: "Iced Dashboard",
  description: "Iced dashboard UI skeleton.",
};

const RootLayout = async ({ children }: { children: ReactNode }) => {
  getValidatedApiBaseUrl();
  await checkApiHealth();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-script" strategy="beforeInteractive">
          {`(() => {
  const stored = window.localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = stored === "light" || stored === "dark"
    ? stored
    : (prefersDark ? "dark" : "light");
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
})();`}
        </Script>
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
};

export default RootLayout;
