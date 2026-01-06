import AuthPage from "@/components/auth/auth-page";

const DashboardRootPage = () => (
  <div className="min-h-screen bg-slate-950 text-slate-100">
    <header className="border-b border-slate-800 px-6 py-4 text-2xl font-semibold">
      Iced
    </header>
    <main className="px-6 py-8">
      <AuthPage />
    </main>
  </div>
);

export default DashboardRootPage;
