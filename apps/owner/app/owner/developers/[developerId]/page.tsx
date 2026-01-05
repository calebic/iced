"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

const formatDate = (value: string | Date | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

type Developer = {
  id: string;
  email: string;
  status: "active" | "disabled";
  disabled_at: string | null;
  created_at: string;
};

type Application = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

type DeveloperDetailResponse = {
  success: boolean;
  data?: {
    developer: Developer;
    apps: Application[];
    stats: {
      apps_count: number;
      end_users_count: number;
      api_keys_count: number;
    };
  };
};

const DeveloperDetailPage = () => {
  const params = useParams<{ developerId: string }>();
  const developerId = params?.developerId;
  const [developer, setDeveloper] = useState<Developer | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [stats, setStats] = useState<DeveloperDetailResponse["data"]["stats"] | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);

  const loadDeveloper = async () => {
    if (!developerId) return;
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`/owner/developers/${developerId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        setError("Unable to load developer details. Please try again.");
        return;
      }

      const payload = (await response.json()) as DeveloperDetailResponse;
      if (!payload.success || !payload.data) {
        setError("Unable to load developer details. Please try again.");
        return;
      }

      setDeveloper(payload.data.developer);
      setApps(payload.data.apps);
      setStats(payload.data.stats);
    } catch {
      setError("Unable to load developer details. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDeveloper();
  }, [developerId]);

  const updateDeveloper = async (action: "enable" | "disable" | "force-logout") => {
    if (!developerId) return;
    setError("");
    setIsWorking(true);

    try {
      const response = await fetch(`/owner/developers/${developerId}/${action}`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        setError("Unable to update developer. Please try again.");
        return;
      }

      await loadDeveloper();
    } catch {
      setError("Unable to update developer. Please try again.");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <Link href="/owner/dashboard" className="text-sm text-slate-400 hover:text-slate-200">
          ← Back to dashboard
        </Link>

        {isLoading ? (
          <div className="text-sm text-slate-400">Loading developer…</div>
        ) : developer ? (
          <>
            <header className="space-y-2">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                Developer Detail
              </p>
              <h1 className="text-2xl font-semibold">{developer.email}</h1>
              <p className="text-sm text-slate-300">
                Status: {developer.status} · Created {formatDate(developer.created_at)}
              </p>
              {developer.disabled_at && (
                <p className="text-sm text-rose-400">
                  Disabled {formatDate(developer.disabled_at)}
                </p>
              )}
            </header>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="h-10 rounded-md border border-slate-700 px-4 text-sm text-slate-200 hover:border-slate-500"
                disabled={isWorking}
                onClick={() =>
                  updateDeveloper(developer.status === "active" ? "disable" : "enable")
                }
              >
                {developer.status === "active" ? "Disable developer" : "Enable developer"}
              </button>
              <button
                type="button"
                className="h-10 rounded-md border border-slate-700 px-4 text-sm text-slate-200 hover:border-slate-500"
                disabled={isWorking}
                onClick={() => updateDeveloper("force-logout")}
              >
                Force logout
              </button>
            </div>

            <div className="min-h-[1.5rem] text-sm text-rose-400" role="alert">
              {error}
            </div>

            {stats && (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                  <p className="text-sm text-slate-400">Applications</p>
                  <p className="text-2xl font-semibold">{stats.apps_count}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                  <p className="text-sm text-slate-400">End users</p>
                  <p className="text-2xl font-semibold">{stats.end_users_count}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                  <p className="text-sm text-slate-400">API keys</p>
                  <p className="text-2xl font-semibold">{stats.api_keys_count}</p>
                </div>
              </div>
            )}

            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Applications</h2>
              {apps.length === 0 ? (
                <p className="text-sm text-slate-400">No applications yet.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {apps.map((app) => (
                    <Link
                      key={app.id}
                      href={`/owner/apps/${app.id}`}
                      className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 transition hover:border-slate-600"
                    >
                      <p className="text-base font-semibold text-white">{app.name}</p>
                      <p className="mt-1 text-sm text-slate-400">
                        Status: {app.status} · Created {formatDate(app.created_at)}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="text-sm text-slate-400">Developer not found.</div>
        )}
      </div>
    </div>
  );
};

export default DeveloperDetailPage;
