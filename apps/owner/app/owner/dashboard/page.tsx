"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const formatDate = (value: string | Date) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

type Developer = {
  id: string;
  email: string;
  status: "active" | "disabled";
  created_at: string;
};

type DevelopersResponse = {
  success: boolean;
  data?: {
    items: Developer[];
    page: number;
    page_size: number;
    total: number;
  };
};

const OwnerDashboardPage = () => {
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [searchEmail, setSearchEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState<string | null>(null);

  const loadDevelopers = async (email?: string) => {
    setError("");
    setIsLoading(true);

    try {
      const params = email ? `?email=${encodeURIComponent(email)}` : "";
      const response = await fetch(`/owner/developers${params}`, {
        credentials: "include",
      });

      if (!response.ok) {
        setError("Unable to load developers. Please try again.");
        return;
      }

      const payload = (await response.json()) as DevelopersResponse;
      if (!payload.success || !payload.data) {
        setError("Unable to load developers. Please try again.");
        return;
      }

      setDevelopers(payload.data.items);
    } catch {
      setError("Unable to load developers. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDevelopers();
  }, []);

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadDevelopers(searchEmail.trim() || undefined);
  };

  const updateDeveloperStatus = async (
    developerId: string,
    action: "enable" | "disable" | "force-logout",
  ) => {
    setError("");
    setIsWorking(developerId + action);

    try {
      const response = await fetch(`/owner/developers/${developerId}/${action}`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        setError("Unable to update developer. Please try again.");
        return;
      }

      await loadDevelopers(searchEmail.trim() || undefined);
    } catch {
      setError("Unable to update developer. Please try again.");
    } finally {
      setIsWorking(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
            Owner Panel
          </p>
          <h1 className="text-2xl font-semibold">Developer Management</h1>
          <p className="text-sm text-slate-300">
            Review developer accounts and manage access across the platform.
          </p>
        </header>

        <form
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
          onSubmit={handleSearch}
        >
          <div className="flex-1">
            <label className="text-xs uppercase tracking-wide text-slate-400">
              Search by email
            </label>
            <input
              className="mt-2 h-11 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-800"
              placeholder="developer@iced.io"
              value={searchEmail}
              onChange={(event) => setSearchEmail(event.target.value)}
            />
          </div>
          <button
            type="submit"
            className="h-11 rounded-md bg-white px-5 text-sm font-semibold text-slate-900"
          >
            Search
          </button>
        </form>

        <div className="min-h-[1.5rem] text-sm text-rose-400" role="alert">
          {error}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-800">
          <div className="bg-slate-900/40 px-6 py-4 text-sm uppercase tracking-wide text-slate-400">
            Developers
          </div>
          {isLoading ? (
            <div className="px-6 py-8 text-sm text-slate-400">
              Loading developers…
            </div>
          ) : developers.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-400">
              No developers found.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {developers.map((developer) => (
                <div
                  key={developer.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-6 py-4"
                >
                  <div>
                    <Link
                      href={`/owner/developers/${developer.id}`}
                      className="text-base font-semibold text-white hover:text-slate-200"
                    >
                      {developer.email}
                    </Link>
                    <div className="mt-1 text-sm text-slate-400">
                      Status: {developer.status} · Created {formatDate(developer.created_at)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="h-9 rounded-md border border-slate-700 px-4 text-sm text-slate-200 hover:border-slate-500"
                      onClick={() =>
                        updateDeveloperStatus(
                          developer.id,
                          developer.status === "active" ? "disable" : "enable",
                        )
                      }
                      disabled={isWorking === developer.id + "disable" || isWorking === developer.id + "enable"}
                    >
                      {developer.status === "active" ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className="h-9 rounded-md border border-slate-700 px-4 text-sm text-slate-200 hover:border-slate-500"
                      onClick={() =>
                        updateDeveloperStatus(developer.id, "force-logout")
                      }
                      disabled={isWorking === developer.id + "force-logout"}
                    >
                      Force logout
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OwnerDashboardPage;
