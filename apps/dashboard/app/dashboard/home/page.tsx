"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ThemeToggle from "@/components/theme-toggle";

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
  email_policy: "required" | "optional" | "disabled";
  license_policy: "required" | "optional" | "disabled";
};

type User = {
  id: string;
  username: string;
  email: string | null;
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

  const updateRegistrationPolicies = async (
    appId: string,
    updates: Partial<Pick<Application, "email_policy" | "license_policy">>,
  ) => {
    setError("");
    try {
      const response = await fetch(`/dashboard/apps/${appId}/settings`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        setError("Unable to update application settings. Please try again.");
        return;
      }

      setApps((prev) =>
        prev.map((app) =>
          app.id === appId
            ? {
                ...app,
                ...updates,
              }
            : app,
        ),
      );
    } catch {
      setError("Unable to update application settings. Please try again.");
    }
  };

  const loadApps = async () => {
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/dashboard/apps", {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.replace("/");
          return;
        }
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
          fetch(`/dashboard/apps/${expandedAppId}/users`, {
            credentials: "include",
          }),
          fetch(`/dashboard/apps/${expandedAppId}/ranks`, {
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
      const response = await fetch(`/dashboard/apps/${appId}/users/${userId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

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
      const response = await fetch("/dashboard/apps", {
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
      const response = await fetch("/dashboard/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        setError("Logout failed. Please try again.");
        return;
      }

      router.push("/");
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
          <p className="text-[var(--theme-muted)]">
            Manage your applications and developer access from one place.
          </p>
        </div>
        <div className="flex w-full max-w-xs items-center justify-end gap-3">
          <ThemeToggle />
          <Button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-auto px-4"
          >
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
          <p className="text-sm text-[var(--theme-muted-strong)]">
            Loading applications…
          </p>
        ) : apps.length === 0 ? (
          <p className="text-sm text-[var(--theme-muted-strong)]">
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
                      <span className="text-sm text-[var(--theme-muted-strong)]">
                        {isExpanded ? "Hide" : "View"} details
                      </span>
                    </CardHeader>
                  </button>
                  <CardContent>
                    <p className="text-sm text-[var(--theme-muted)]">
                      Created {formatDate(app.created_at)}
                    </p>
                    <div
                      className={`overflow-hidden transition-all duration-200 ${
                        isExpanded
                          ? "max-h-[500px] opacity-100"
                          : "max-h-0 opacity-0"
                      }`}
                    >
                      <div className="mt-4 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-panel-bg)] p-4">
                        <h3 className="text-sm font-semibold text-[var(--theme-fg)]">
                          Users
                        </h3>
                        {!usersState || usersState.isLoading ? (
                          <p className="mt-2 text-sm text-[var(--theme-muted-strong)]">
                            Loading users…
                          </p>
                        ) : usersState.error ? (
                          <p className="mt-2 text-sm text-rose-400" role="alert">
                            {usersState.error}
                          </p>
                        ) : usersState.items.length === 0 ? (
                          <p className="mt-2 text-sm text-[var(--theme-muted-strong)]">
                            {usersState.emptyMessage}
                          </p>
                        ) : (
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-left text-sm text-[var(--theme-fg)]">
                              <thead className="text-xs uppercase text-[var(--theme-muted-strong)]">
                                <tr>
                                  <th className="py-2">Username</th>
                                  <th className="py-2">Email</th>
                                  <th className="py-2">Rank</th>
                                  <th className="py-2">Status</th>
                                  <th className="py-2">Created</th>
                                  <th className="py-2">Last login</th>
                                  <th className="py-2 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--theme-border)]">
                                {usersState.items.map((user) => (
                                  <tr key={user.id} className="align-top">
                                    <td className="py-3">{user.username}</td>
                                    <td className="py-3">{user.email ?? "—"}</td>
                                    <td className="py-3">
                                      <select
                                        className="h-9 rounded-md border border-[var(--theme-input-border)] bg-[var(--theme-input-bg)] px-2 text-sm text-[var(--theme-input-text)]"
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
                      <div className="mt-4 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-panel-bg)] p-4">
                        <h3 className="text-sm font-semibold text-[var(--theme-fg)]">
                          Registration requirements
                        </h3>
                        <p className="mt-1 text-sm text-[var(--theme-muted-strong)]">
                          Configure which fields are required when end users
                          register through the public API.
                        </p>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`email-policy-${app.id}`}>
                              Email policy
                            </Label>
                            <select
                              id={`email-policy-${app.id}`}
                              className="h-9 w-full rounded-md border border-[var(--theme-input-border)] bg-[var(--theme-input-bg)] px-2 text-sm text-[var(--theme-input-text)]"
                              value={app.email_policy}
                              onChange={(event) =>
                                updateRegistrationPolicies(app.id, {
                                  email_policy: event.target
                                    .value as Application["email_policy"],
                                })
                              }
                            >
                              <option value="required">Required</option>
                              <option value="optional">Optional</option>
                              <option value="disabled">Disabled</option>
                            </select>
                            <p className="text-xs text-[var(--theme-muted-strong)]">
                              Required forces end users to provide email.
                              Disabled rejects email on registration.
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`license-policy-${app.id}`}>
                              License policy
                            </Label>
                            <select
                              id={`license-policy-${app.id}`}
                              className="h-9 w-full rounded-md border border-[var(--theme-input-border)] bg-[var(--theme-input-bg)] px-2 text-sm text-[var(--theme-input-text)]"
                              value={app.license_policy}
                              onChange={(event) =>
                                updateRegistrationPolicies(app.id, {
                                  license_policy: event.target
                                    .value as Application["license_policy"],
                                })
                              }
                            >
                              <option value="required">Required</option>
                              <option value="optional">Optional</option>
                              <option value="disabled">Disabled</option>
                            </select>
                            <p className="text-xs text-[var(--theme-muted-strong)]">
                              Required forces a license code during registration.
                              Disabled rejects license codes on sign up.
                            </p>
                          </div>
                        </div>
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
