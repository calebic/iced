"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDashboardApiUrl } from "@/lib/api";

const formatDate = (value: string | Date) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

type Application = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

type User = {
  id: string;
  email: string;
  rank_id: string | null;
  status: "active" | "disabled";
  created_at: string;
  last_login_at: string | null;
};

type Rank = {
  id: string;
  name: string;
};

type UsersState = {
  items: User[];
  isLoading: boolean;
  error: string;
  emptyMessage: string;
  ranks: Rank[];
};

const HomePage = () => {
  const router = useRouter();
  const [apps, setApps] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [createError, setCreateError] = useState("");
  const [appName, setAppName] = useState("");
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);
  const [usersByApp, setUsersByApp] = useState<Record<string, UsersState>>({});

  const loadApps = async () => {
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(getDashboardApiUrl("/dashboard/apps"), {
        credentials: "include",
      });

      if (!response.ok) {
        setError("Unable to load applications. Please try again.");
        return;
      }

      const payload = (await response.json()) as {
        success: boolean;
        data?: Application[];
      };

      if (!payload.success || !payload.data) {
        setError("Unable to load applications. Please try again.");
        return;
      }

      setApps(payload.data);
    } catch {
      setError("Unable to load applications. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadApps();
  }, []);

  useEffect(() => {
    if (!expandedAppId || usersByApp[expandedAppId]) {
      return;
    }

    const loadUsers = async () => {
      setUsersByApp((prev) => ({
        ...prev,
        [expandedAppId]: {
          items: [],
          ranks: [],
          isLoading: true,
          error: "",
          emptyMessage: "No users found for this application.",
        },
      }));

      try {
        const [usersResponse, ranksResponse] = await Promise.all([
          fetch(getDashboardApiUrl(`/dashboard/apps/${expandedAppId}/users`), {
            credentials: "include",
          }),
          fetch(getDashboardApiUrl(`/dashboard/apps/${expandedAppId}/ranks`), {
            credentials: "include",
          }),
        ]);

        if (!usersResponse.ok) {
          setUsersByApp((prev) => ({
            ...prev,
            [expandedAppId]: {
              ...prev[expandedAppId],
              isLoading: false,
              error: "Unable to load users. Please try again.",
            },
          }));
          return;
        }

        const usersPayload = (await usersResponse.json()) as {
          success: boolean;
          data?: { items: User[] };
        };

        const ranksPayload = ranksResponse.ok
          ? ((await ranksResponse.json()) as {
              success: boolean;
              data?: Rank[];
            })
          : { success: false };

        const users = usersPayload.success ? usersPayload.data?.items ?? [] : [];
        const ranks = ranksPayload.success && ranksPayload.data ? ranksPayload.data : [];

        setUsersByApp((prev) => ({
          ...prev,
          [expandedAppId]: {
            ...prev[expandedAppId],
            items: users,
            ranks,
            isLoading: false,
            error: usersPayload.success ? "" : "Unable to load users. Please try again.",
            emptyMessage: users.length === 0 ? "No users found for this application." : "",
          },
        }));
      } catch {
        setUsersByApp((prev) => ({
          ...prev,
          [expandedAppId]: {
            ...prev[expandedAppId],
            isLoading: false,
            error: "Unable to load users. Please try again.",
          },
        }));
      }
    };

    void loadUsers();
  }, [expandedAppId, usersByApp]);

  const updateUser = async (
    appId: string,
    userId: string,
    updates: { status?: "active" | "disabled"; rank_id?: string | null },
  ) => {
    setUsersByApp((prev) => ({
      ...prev,
      [appId]: prev[appId]
        ? {
            ...prev[appId],
            error: "",
          }
        : {
            items: [],
            ranks: [],
            isLoading: false,
            error: "",
            emptyMessage: "",
          },
    }));

    try {
      const response = await fetch(
        getDashboardApiUrl(`/dashboard/apps/${appId}/users/${userId}`),
        {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      },
      );

      if (!response.ok) {
      setUsersByApp((prev) => ({
        ...prev,
        [appId]: prev[appId]
          ? {
              ...prev[appId],
              error: "Unable to update the user. Please try again.",
            }
          : {
              items: [],
              ranks: [],
              isLoading: false,
              error: "Unable to update the user. Please try again.",
              emptyMessage: "",
            },
      }));
      return;
    }

      const payload = (await response.json()) as {
        success: boolean;
        data?: { user?: User };
      };

      if (!payload.success || !payload.data?.user) {
      setUsersByApp((prev) => ({
        ...prev,
        [appId]: prev[appId]
          ? {
              ...prev[appId],
              error: "Unable to update the user. Please try again.",
            }
          : {
              items: [],
              ranks: [],
              isLoading: false,
              error: "Unable to update the user. Please try again.",
              emptyMessage: "",
            },
      }));
      return;
    }

      setUsersByApp((prev) => ({
        ...prev,
        [appId]: prev[appId]
          ? {
              ...prev[appId],
              items: prev[appId].items.map((user) =>
                user.id === userId ? payload.data!.user! : user,
              ),
            }
          : {
              items: payload.data ? [payload.data.user!] : [],
              ranks: [],
              isLoading: false,
              error: "",
              emptyMessage: "",
            },
      }));
    } catch {
      setUsersByApp((prev) => ({
        ...prev,
        [appId]: prev[appId]
          ? {
              ...prev[appId],
              error: "Unable to update the user. Please try again.",
            }
          : {
              items: [],
              ranks: [],
              isLoading: false,
              error: "Unable to update the user. Please try again.",
              emptyMessage: "",
            },
      }));
    }
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!appName.trim()) {
      setCreateError("Please enter an application name.");
      return;
    }

    setCreateError("");
    setIsCreating(true);

    try {
      const response = await fetch(getDashboardApiUrl("/dashboard/apps"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: appName.trim() }),
      });

      if (!response.ok) {
        setCreateError("Unable to create the application. Please try again.");
        return;
      }

      setAppName("");
      await loadApps();
    } catch {
      setCreateError("Unable to create the application. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleLogout = async () => {
    setError("");
    setIsLoggingOut(true);

    try {
      const response = await fetch(getDashboardApiUrl("/dashboard/auth/logout"), {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        setError("Logout failed. Please try again.");
        return;
      }

      router.push("/dashboard/login");
    } catch {
      setError("Unable to log out right now. Please try again.");
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Dashboard Home</h1>
          <p className="text-slate-300">
            Manage your applications and developer access from one place.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <Button type="button" onClick={handleLogout} disabled={isLoggingOut}>
            {isLoggingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </div>

      <div className="min-h-[1.5rem] text-sm text-rose-400" role="alert">
        {error}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create Application</CardTitle>
          <CardDescription>Spin up a new project for your users.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleCreate}>
            <div className="space-y-2">
              <Label htmlFor="app-name">Application name</Label>
              <Input
                id="app-name"
                name="app-name"
                placeholder="My next app"
                value={appName}
                onChange={(event) => setAppName(event.target.value)}
              />
            </div>
            <div className="min-h-[1.5rem] text-sm text-rose-400" role="alert">
              {createError}
            </div>
            <div className="max-w-xs">
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Creating…" : "Create application"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Your applications</h2>
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading applications…</p>
        ) : apps.length === 0 ? (
          <p className="text-sm text-slate-400">
            No applications yet. Create one to get started.
          </p>
        ) : (
          <div className="grid gap-4">
            {apps.map((app) => {
              const isExpanded = expandedAppId === app.id;

              const usersState = usersByApp[app.id];

              return (
                <Card key={app.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedAppId(isExpanded ? null : app.id)
                    }
                    className="w-full text-left"
                    aria-expanded={isExpanded}
                  >
                    <CardHeader className="flex flex-row items-center justify-between gap-4">
                      <div className="space-y-1">
                        <CardTitle>{app.name}</CardTitle>
                        <CardDescription>Status: {app.status}</CardDescription>
                      </div>
                      <span className="text-sm text-slate-400">
                        {isExpanded ? "Hide" : "View"} details
                      </span>
                    </CardHeader>
                  </button>
                  <CardContent>
                    <p className="text-sm text-slate-300">
                      Created {formatDate(app.created_at)}
                    </p>
                    <div
                      className={`overflow-hidden transition-all duration-200 ${
                        isExpanded
                          ? "max-h-[500px] opacity-100"
                          : "max-h-0 opacity-0"
                      }`}
                    >
                      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                        <h3 className="text-sm font-semibold text-slate-100">
                          Users
                        </h3>
                        {!usersState || usersState.isLoading ? (
                          <p className="mt-2 text-sm text-slate-400">
                            Loading users…
                          </p>
                        ) : usersState.error ? (
                          <p className="mt-2 text-sm text-rose-400" role="alert">
                            {usersState.error}
                          </p>
                        ) : usersState.items.length === 0 ? (
                          <p className="mt-2 text-sm text-slate-400">
                            {usersState.emptyMessage}
                          </p>
                        ) : (
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-left text-sm text-slate-200">
                              <thead className="text-xs uppercase text-slate-500">
                                <tr>
                                  <th className="py-2">Email</th>
                                  <th className="py-2">Rank</th>
                                  <th className="py-2">Status</th>
                                  <th className="py-2">Created</th>
                                  <th className="py-2">Last login</th>
                                  <th className="py-2 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800">
                                {usersState.items.map((user) => (
                                  <tr key={user.id} className="align-top">
                                    <td className="py-3">{user.email}</td>
                                    <td className="py-3">
                                      <select
                                        className="h-9 rounded-md border border-slate-800 bg-slate-950 px-2 text-sm text-slate-100"
                                        value={user.rank_id ?? ""}
                                        onChange={(event) =>
                                          updateUser(app.id, user.id, {
                                            rank_id: event.target.value || null,
                                          })
                                        }
                                      >
                                        <option value="">No rank</option>
                                        {usersState.ranks.map((rank) => (
                                          <option key={rank.id} value={rank.id}>
                                            {rank.name}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="py-3 capitalize">
                                      {user.status}
                                    </td>
                                    <td className="py-3">
                                      {formatDate(user.created_at)}
                                    </td>
                                    <td className="py-3">
                                      {user.last_login_at
                                        ? formatDate(user.last_login_at)
                                        : "—"}
                                    </td>
                                    <td className="py-3 text-right">
                                      <Button
                                        type="button"
                                        className="h-9 w-auto px-4"
                                        onClick={() =>
                                          updateUser(app.id, user.id, {
                                            status:
                                              user.status === "active"
                                                ? "disabled"
                                                : "active",
                                          })
                                        }
                                      >
                                        {user.status === "active"
                                          ? "Disable"
                                          : "Enable"}
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default HomePage;
