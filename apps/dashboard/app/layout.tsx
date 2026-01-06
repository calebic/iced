import type { ReactNode } from "react";
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
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
};

export default RootLayout;
