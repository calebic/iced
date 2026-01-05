import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Iced Owner Panel",
  description: "Owner panel authentication UI.",
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <body className="min-h-screen">{children}</body>
  </html>
);

export default RootLayout;
