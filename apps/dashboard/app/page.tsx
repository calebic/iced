import AuthPage from "@/components/auth/auth-page";

const DashboardRootPage = () => (
  <div className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-fg)]">
    <header className="border-b border-[var(--theme-border)] px-6 py-4 text-2xl font-semibold">
      Iced
    </header>
    <main className="px-6 py-8">
      <AuthPage />
    </main>
  </div>
);

export default DashboardRootPage;
