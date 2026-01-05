import type { ReactNode } from "react";

const DashboardLayout = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-slate-950 text-slate-100">
    <header className="border-b border-slate-800 px-6 py-4 text-2xl font-semibold">
      Iced
    </header>
    <main className="px-6 py-8">{children}</main>
  </div>
);

export default DashboardLayout;
