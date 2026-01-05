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

type ApiKey = {
  id: string;
  masked: string;
  last4: string;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

type AppDetailsResponse = {
  success: boolean;
  data?: {
    app: {
      id: string;
      name: string;
      status: string;
      developer: {
        id: string;
        email: string;
      };
      created_at: string;
    };
    api_keys: ApiKey[];
    stats: {
      api_keys_count: number;
      end_users_count: number;
      licenses_count: number;
    };
  };
};

const AppDetailPage = () => {
  const params = useParams<{ appId: string }>();
  const appId = params?.appId;
  const [app, setApp] = useState<AppDetailsResponse["data"]["app"] | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [stats, setStats] = useState<AppDetailsResponse["data"]["stats"] | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState<string | null>(null);

  const loadApp = async () => {
    if (!appId) return;
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`/owner/apps/${appId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        setError("Unable to load application details. Please try again.");
        return;
      }

      const payload = (await response.json()) as AppDetailsResponse;
      if (!payload.success || !payload.data) {
        setError("Unable to load application details. Please try again.");
        return;
      }

      setApp(payload.data.app);
      setApiKeys(payload.data.api_keys);
      setStats(payload.data.stats);
    } catch {
      setError("Unable to load application details. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadApp();
  }, [appId]);

  const updateAppStatus = async (action: "enable" | "disable") => {
    if (!appId) return;
    setError("");
    setIsWorking(action);

    try {
      const response = await fetch(`/owner/apps/${appId}/${action}`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        setError("Unable to update application. Please try again.");
        return;
      }

      await loadApp();
    } catch {
      setError("Unable to update application. Please try again.");
    } finally {
      setIsWorking(null);
    }
  };

  const revokeKey = async (keyId: string) => {
    if (!appId) return;
    setError("");
    setIsWorking(keyId);

    try {
      const response = await fetch(`/owner/apps/${appId}/keys/${keyId}/revoke`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        setError("Unable to revoke API key. Please try again.");
        return;
      }

      await loadApp();
    } catch {
      setError("Unable to revoke API key. Please try again.");
    } finally {
      setIsWorking(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <Link href="/owner/dashboard" className="text-sm text-slate-400 hover:text-slate-200">
          ← Back to dashboard
        </Link>

        {isLoading ? (
          <div className="text-sm text-slate-400">Loading application…</div>
        ) : app ? (
          <>
            <header className="space-y-2">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                Application Detail
              </p>
              <h1 className="text-2xl font-semibold">{app.name}</h1>
              <p className="text-sm text-slate-300">
                Status: {app.status} · Created {formatDate(app.created_at)}
              </p>
              <Link
                href={`/owner/developers/${app.developer.id}`}
                className="text-sm text-slate-400 hover:text-slate-200"
              >
                Developer: {app.developer.email}
              </Link>
            </header>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="h-10 rounded-md border border-slate-700 px-4 text-sm text-slate-200 hover:border-slate-500"
                disabled={isWorking === "enable" || isWorking === "disable"}
                onClick={() =>
                  updateAppStatus(app.status === "active" ? "disable" : "enable")
                }
              >
                {app.status === "active" ? "Disable application" : "Enable application"}
              </button>
            </div>

            <div className="min-h-[1.5rem] text-sm text-rose-400" role="alert">
              {error}
            </div>

            {stats && (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                  <p className="text-sm text-slate-400">API keys</p>
                  <p className="text-2xl font-semibold">{stats.api_keys_count}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                  <p className="text-sm text-slate-400">End users</p>
                  <p className="text-2xl font-semibold">{stats.end_users_count}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                  <p className="text-sm text-slate-400">Licenses</p>
                  <p className="text-2xl font-semibold">{stats.licenses_count}</p>
                </div>
              </div>
            )}

            <section className="space-y-4">
              <h2 className="text-lg font-semibold">API Keys</h2>
              {apiKeys.length === 0 ? (
                <p className="text-sm text-slate-400">No API keys found.</p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900/40 text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-6 py-3">Key</th>
                        <th className="px-6 py-3">Last used</th>
                        <th className="px-6 py-3">Created</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {apiKeys.map((key) => (
                        <tr key={key.id}>
                          <td className="px-6 py-4 font-mono text-sm">
                            {key.masked}
                          </td>
                          <td className="px-6 py-4 text-slate-300">
                            {formatDate(key.last_used_at)}
                          </td>
                          <td className="px-6 py-4 text-slate-300">
                            {formatDate(key.created_at)}
                          </td>
                          <td className="px-6 py-4 text-slate-300">
                            {key.revoked_at ? "Revoked" : "Active"}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              className="h-9 rounded-md border border-slate-700 px-4 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-50"
                              onClick={() => revokeKey(key.id)}
                              disabled={!!key.revoked_at || isWorking === key.id}
                            >
                              Revoke
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="text-sm text-slate-400">Application not found.</div>
        )}
      </div>
    </div>
  );
};

export default AppDetailPage;
