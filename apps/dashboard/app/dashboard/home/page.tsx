"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ThemeToggle from "@/components/theme-toggle";
import { banUser, type BanUserPayload, unbanUser } from "@/lib/api-users";

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
  banned_until: string | null;
  ban_reason: string | null;
  banned_at: string | null;
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

type ApiKeyData = {
  hasKey: boolean;
  last4: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
};

type ApiKeyState = {
  data?: ApiKeyData;
  maskedKey: string;
  fullKey: string | null;
  isLoading: boolean;
  error: string;
  isRevealed: boolean;
  showHint: boolean;
};

type BanModalState = {
  appId: string;
  user: User;
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
  const [apiKeysByApp, setApiKeysByApp] = useState<Record<string, ApiKeyState>>({});
  const [banModal, setBanModal] = useState<BanModalState | null>(null);
  const [banFormError, setBanFormError] = useState("");
  const [banForm, setBanForm] = useState<{
    durationSeconds?: number;
    customUntil: string;
    permanent: boolean;
    reason: string;
    revokeSessions: boolean;
  }>({
    customUntil: "",
    permanent: false,
    reason: "",
    revokeSessions: false,
  });
  const [toast, setToast] = useState("");

  const getMaskedKey = (last4?: string | null) =>
    last4 ? `••••••${last4}` : "••••••";

  const isUserBanned = (user: User) =>
    user.banned_until ? new Date(user.banned_until) > new Date() : false;

  const isPermanentBan = (user: User) =>
    user.banned_until ? new Date(user.banned_until).getUTCFullYear() >= 9999 : false;

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

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

    const loadApiKey = async () => {
      setApiKeysByApp((prev) => ({
        ...prev,
        [expandedAppId]: {
          data: prev[expandedAppId]?.data,
          maskedKey: prev[expandedAppId]?.maskedKey ?? "••••••",
          fullKey: prev[expandedAppId]?.fullKey ?? null,
          isLoading: true,
          error: "",
          isRevealed: prev[expandedAppId]?.isRevealed ?? false,
          showHint: prev[expandedAppId]?.showHint ?? false,
        },
      }));

      try {
        const response = await fetch(
          `/dashboard/apps/${expandedAppId}/api-key`,
          {
            credentials: "include",
          },
        );

        if (!response.ok) {
          setApiKeysByApp((prev) => ({
            ...prev,
            [expandedAppId]: {
              data: prev[expandedAppId]?.data,
              maskedKey: prev[expandedAppId]?.maskedKey ?? "••••••",
              fullKey: prev[expandedAppId]?.fullKey ?? null,
              isLoading: false,
              error: "Unable to load API credentials. Please try again.",
              isRevealed: prev[expandedAppId]?.isRevealed ?? false,
              showHint: prev[expandedAppId]?.showHint ?? false,
            },
          }));
          return;
        }

        const payload = (await response.json()) as {
          success: boolean;
          data?: ApiKeyData;
        };

        if (!payload.success || !payload.data) {
          setApiKeysByApp((prev) => ({
            ...prev,
            [expandedAppId]: {
              data: prev[expandedAppId]?.data,
              maskedKey: prev[expandedAppId]?.maskedKey ?? "••••••",
              fullKey: prev[expandedAppId]?.fullKey ?? null,
              isLoading: false,
              error: "Unable to load API credentials. Please try again.",
              isRevealed: prev[expandedAppId]?.isRevealed ?? false,
              showHint: prev[expandedAppId]?.showHint ?? false,
            },
          }));
          return;
        }

        const maskedKey = getMaskedKey(payload.data.last4);
        setApiKeysByApp((prev) => ({
          ...prev,
          [expandedAppId]: {
            data: payload.data,
            maskedKey,
            fullKey: null,
            isLoading: false,
            error: "",
            isRevealed: false,
            showHint: false,
          },
        }));
      } catch {
        setApiKeysByApp((prev) => ({
          ...prev,
          [expandedAppId]: {
            data: prev[expandedAppId]?.data,
            maskedKey: prev[expandedAppId]?.maskedKey ?? "••••••",
            fullKey: prev[expandedAppId]?.fullKey ?? null,
            isLoading: false,
            error: "Unable to load API credentials. Please try again.",
            isRevealed: prev[expandedAppId]?.isRevealed ?? false,
            showHint: prev[expandedAppId]?.showHint ?? false,
          },
        }));
      }
    };

    void loadUsers();
    void loadApiKey();
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

  const updateUserState = (appId: string, user: User) => {
    setUsersByApp((prev) => ({
      ...prev,
      [appId]: prev[appId]
        ? {
            ...prev[appId],
            items: prev[appId].items.map((entry) =>
              entry.id === user.id ? user : entry,
            ),
          }
        : {
            items: [user],
            ranks: [],
            isLoading: false,
            error: "",
            emptyMessage: "",
          },
    }));
  };

  const openBanModal = (appId: string, user: User) => {
    setBanForm({
      durationSeconds: undefined,
      customUntil: "",
      permanent: false,
      reason: "",
      revokeSessions: false,
    });
    setBanFormError("");
    setBanModal({ appId, user });
  };

  const submitBan = async () => {
    if (!banModal) return;

    const { appId, user } = banModal;
    if (!banForm.permanent && !banForm.customUntil && !banForm.durationSeconds) {
      setBanFormError("Select a preset, custom date, or permanent ban.");
      return;
    }

    const payload: BanUserPayload = {
      reason: banForm.reason.trim() || undefined,
      revoke_sessions: banForm.revokeSessions,
      permanent: banForm.permanent || undefined,
    };

    if (banForm.permanent) {
      payload.permanent = true;
    } else if (banForm.customUntil) {
      payload.banned_until = new Date(banForm.customUntil).toISOString();
    } else if (banForm.durationSeconds) {
      payload.duration_seconds = banForm.durationSeconds;
    }

    try {
      const response = await banUser(appId, user.id, payload);
      if (!response.ok) {
        setBanFormError("Unable to ban user. Please try again.");
        return;
      }

      const data = (await response.json()) as {
        success: boolean;
        data?: { user?: User };
      };

      if (!data.success || !data.data?.user) {
        setBanFormError("Unable to ban user. Please try again.");
        return;
      }

      updateUserState(appId, data.data.user);
      setToast("User banned.");
      setBanModal(null);
    } catch {
      setBanFormError("Unable to ban user. Please try again.");
    }
  };

  const handleUnban = async (appId: string, user: User) => {
    try {
      const response = await unbanUser(appId, user.id);
      if (!response.ok) {
        setUsersByApp((prev) => ({
          ...prev,
          [appId]: {
            ...prev[appId],
            error: "Unable to unban the user. Please try again.",
          },
        }));
        return;
      }

      const data = (await response.json()) as {
        success: boolean;
        data?: { user?: User };
      };

      if (!data.success || !data.data?.user) {
        setUsersByApp((prev) => ({
          ...prev,
          [appId]: {
            ...prev[appId],
            error: "Unable to unban the user. Please try again.",
          },
        }));
        return;
      }

      updateUserState(appId, data.data.user);
      setToast("User unbanned.");
    } catch {
      setUsersByApp((prev) => ({
        ...prev,
        [appId]: {
          ...prev[appId],
          error: "Unable to unban the user. Please try again.",
        },
      }));
    }
  };

  const toggleApiKeyVisibility = (appId: string) => {
    setApiKeysByApp((prev) => ({
      ...prev,
      [appId]: {
        ...prev[appId],
        isRevealed: prev[appId]?.fullKey
          ? !(prev[appId]?.isRevealed ?? false)
          : false,
        showHint: !prev[appId]?.fullKey && !(prev[appId]?.isRevealed ?? false),
      },
    }));
  };

  const copyApiKey = async (appId: string) => {
    const entry = apiKeysByApp[appId];
    const apiKey = entry?.isRevealed ? entry.fullKey : null;
    if (!apiKey) return;

    try {
      await navigator.clipboard.writeText(apiKey);
    } catch {
      setApiKeysByApp((prev) => ({
        ...prev,
        [appId]: {
          ...prev[appId],
          error: "Unable to copy the API key. Please copy manually.",
        },
      }));
    }
  };

  const rotateApiKey = async (appId: string) => {
    const confirmRotation = window.confirm(
      "Regenerate API key? The existing key will be revoked immediately.",
    );
    if (!confirmRotation) return;

    setApiKeysByApp((prev) => ({
      ...prev,
      [appId]: {
        data: prev[appId]?.data,
        maskedKey: prev[appId]?.maskedKey ?? "••••••",
        fullKey: prev[appId]?.fullKey ?? null,
        isLoading: true,
        error: "",
        isRevealed: true,
        showHint: false,
      },
    }));

    try {
      const response = await fetch(`/dashboard/apps/${appId}/api-key/rotate`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        setApiKeysByApp((prev) => ({
          ...prev,
          [appId]: {
            data: prev[appId]?.data,
            maskedKey: prev[appId]?.maskedKey ?? "••••••",
            fullKey: prev[appId]?.fullKey ?? null,
            isLoading: false,
            error: "Unable to rotate API key. Please try again.",
            isRevealed: prev[appId]?.isRevealed ?? false,
            showHint: prev[appId]?.showHint ?? false,
          },
        }));
        return;
      }

      const payload = (await response.json()) as {
        success: boolean;
        data?: { apiKey: string; last4: string; createdAt: string };
      };

      if (!payload.success || !payload.data) {
        setApiKeysByApp((prev) => ({
          ...prev,
          [appId]: {
            data: prev[appId]?.data,
            maskedKey: prev[appId]?.maskedKey ?? "••••••",
            fullKey: prev[appId]?.fullKey ?? null,
            isLoading: false,
            error: "Unable to rotate API key. Please try again.",
            isRevealed: prev[appId]?.isRevealed ?? false,
            showHint: prev[appId]?.showHint ?? false,
          },
        }));
        return;
      }

      const maskedKey = getMaskedKey(payload.data.last4);
      setApiKeysByApp((prev) => ({
        ...prev,
        [appId]: {
          data: {
            hasKey: true,
            last4: payload.data.last4,
            createdAt: payload.data.createdAt,
            lastUsedAt: null,
          },
          maskedKey,
          fullKey: payload.data.apiKey,
          isLoading: false,
          error: "",
          isRevealed: true,
          showHint: false,
        },
      }));
    } catch {
      setApiKeysByApp((prev) => ({
        ...prev,
        [appId]: {
          data: prev[appId]?.data,
          maskedKey: prev[appId]?.maskedKey ?? "••••••",
          fullKey: prev[appId]?.fullKey ?? null,
          isLoading: false,
          error: "Unable to rotate API key. Please try again.",
          isRevealed: prev[appId]?.isRevealed ?? false,
          showHint: prev[appId]?.showHint ?? false,
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
      {toast ? (
        <div className="fixed right-4 top-4 z-50 rounded-md border border-[var(--theme-border)] bg-[var(--theme-panel-bg)] px-4 py-2 text-sm text-[var(--theme-fg)] shadow-lg">
          {toast}
        </div>
      ) : null}
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
              const apiKeyState = apiKeysByApp[app.id];

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
                    {isExpanded ? (
                      <div className="mt-4 space-y-4">
                        <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-panel-bg)] p-4">
                          <h3 className="text-sm font-semibold text-[var(--theme-fg)]">
                            API Credentials
                          </h3>
                          <p className="mt-1 text-sm text-[var(--theme-muted-strong)]">
                            Use this key in your app to authenticate public API requests.
                          </p>
                          {apiKeyState?.error ? (
                            <p className="mt-1 text-sm text-rose-400" role="alert">
                              {apiKeyState.error}
                            </p>
                          ) : null}
                          {apiKeyState?.isRevealed && apiKeyState.fullKey ? (
                            <p className="mt-1 text-xs text-amber-500">
                              Copy this now — it won’t be shown again.
                            </p>
                          ) : null}
                          {apiKeyState?.showHint ? (
                            <p className="mt-1 text-xs text-[var(--theme-muted-strong)]">
                              Full key is only shown once after regeneration.
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <div className="min-w-[220px] rounded-md border border-[var(--theme-border)] bg-[var(--theme-input-bg)] px-3 py-2 text-sm font-mono text-[var(--theme-input-text)]">
                              {apiKeyState?.isLoading
                                ? "Loading…"
                                : apiKeyState?.isRevealed && apiKeyState.fullKey
                                  ? apiKeyState.fullKey
                                  : apiKeyState?.maskedKey ?? "••••••"}
                            </div>
                            <Button
                              type="button"
                              className="h-7 w-auto border border-[var(--theme-border)] bg-transparent px-2 text-[11px] text-[var(--theme-fg)] hover:bg-[var(--theme-panel-bg)]"
                              disabled={apiKeyState?.isLoading}
                              onClick={() => toggleApiKeyVisibility(app.id)}
                            >
                              {apiKeyState?.isRevealed ? "Hide" : "Show"}
                            </Button>
                            <Button
                              type="button"
                              className="h-7 w-auto border border-[var(--theme-border)] bg-transparent px-2 text-[11px] text-[var(--theme-fg)] hover:bg-[var(--theme-panel-bg)]"
                              disabled={
                                apiKeyState?.isLoading ||
                                !apiKeyState?.fullKey ||
                                !apiKeyState?.isRevealed
                              }
                              onClick={() => copyApiKey(app.id)}
                            >
                              Copy
                            </Button>
                            <Button
                              type="button"
                              disabled={apiKeyState?.isLoading}
                              className="h-7 w-auto bg-rose-500 px-2 text-[11px] text-white hover:bg-rose-600 focus-visible:ring-rose-400"
                              onClick={() => rotateApiKey(app.id)}
                            >
                              Regenerate
                            </Button>
                          </div>
                          {apiKeyState?.data ? (
                            <p className="mt-1 text-xs text-[var(--theme-muted-strong)]">
                              {apiKeyState.data.createdAt
                                ? `Created ${formatDate(apiKeyState.data.createdAt)}`
                                : "Created —"}
                              {apiKeyState.data.lastUsedAt
                                ? ` • Last used ${formatDate(apiKeyState.data.lastUsedAt)}`
                                : " • Never used"}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-[var(--theme-muted-strong)]">
                            Regenerating revokes the existing key immediately. Store the
                            new key somewhere safe.
                          </p>
                        </div>
                        <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-panel-bg)] p-4">
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
                                    <th className="py-2">Access</th>
                                    <th className="py-2">Created</th>
                                    <th className="py-2">Last login</th>
                                    <th className="py-2 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--theme-border)]">
                                  {usersState.items.map((user) => {
                                    const banned = isUserBanned(user);
                                    const permanent = banned && isPermanentBan(user);
                                    return (
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
                                      <td className="py-3">
                                        <div className="font-medium">
                                          {banned ? "Banned" : "Allowed"}
                                        </div>
                                        <div className="text-xs text-[var(--theme-muted-strong)]">
                                          {banned
                                            ? permanent
                                              ? "Permanent"
                                              : `until ${formatDate(user.banned_until!)}`
                                            : "Access granted"}
                                        </div>
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
                                        {banned ? (
                                          <Button
                                            type="button"
                                            className="h-8 w-auto px-3 text-xs"
                                            onClick={() => handleUnban(app.id, user)}
                                          >
                                            Unban
                                          </Button>
                                        ) : (
                                          <Button
                                            type="button"
                                            className="h-8 w-auto bg-rose-500 px-3 text-xs text-white hover:bg-rose-600 focus-visible:ring-rose-400"
                                            onClick={() => openBanModal(app.id, user)}
                                          >
                                            Ban
                                          </Button>
                                        )}
                                      </td>
                                    </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                        <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-panel-bg)] p-4">
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
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {banModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-lg border border-[var(--theme-border)] bg-[var(--theme-panel-bg)] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--theme-fg)]">
                  Ban {banModal.user.username}
                </h2>
                <p className="text-sm text-[var(--theme-muted-strong)]">
                  Choose how long access should be revoked.
                </p>
              </div>
              <button
                type="button"
                className="text-sm text-[var(--theme-muted-strong)] hover:text-[var(--theme-fg)]"
                onClick={() => setBanModal(null)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>Duration presets</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "1h", value: 60 * 60 },
                    { label: "24h", value: 60 * 60 * 24 },
                    { label: "7d", value: 60 * 60 * 24 * 7 },
                    { label: "30d", value: 60 * 60 * 24 * 30 },
                  ].map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      className={`h-8 w-auto border px-3 text-xs ${
                        banForm.durationSeconds === preset.value
                          ? "border-[var(--theme-ring)] bg-[var(--theme-panel-bg)]"
                          : "border-[var(--theme-border)] bg-transparent"
                      }`}
                      onClick={() =>
                        setBanForm((prev) => ({
                          ...prev,
                          durationSeconds: preset.value,
                          customUntil: "",
                          permanent: false,
                        }))
                      }
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ban-until">Custom end date</Label>
                <Input
                  id="ban-until"
                  type="datetime-local"
                  value={banForm.customUntil}
                  onChange={(event) =>
                    setBanForm((prev) => ({
                      ...prev,
                      customUntil: event.target.value,
                      durationSeconds: undefined,
                      permanent: false,
                    }))
                  }
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--theme-fg)]">
                <input
                  type="checkbox"
                  checked={banForm.permanent}
                  onChange={(event) =>
                    setBanForm((prev) => ({
                      ...prev,
                      permanent: event.target.checked,
                      durationSeconds: undefined,
                      customUntil: "",
                    }))
                  }
                />
                Permanent ban
              </label>

              <div className="space-y-2">
                <Label htmlFor="ban-reason">Reason (optional)</Label>
                <textarea
                  id="ban-reason"
                  value={banForm.reason}
                  onChange={(event) =>
                    setBanForm((prev) => ({
                      ...prev,
                      reason: event.target.value,
                    }))
                  }
                  className="min-h-[90px] w-full rounded-md border border-[var(--theme-input-border)] bg-[var(--theme-input-bg)] p-2 text-sm text-[var(--theme-input-text)]"
                  placeholder="Add a note for internal tracking..."
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--theme-fg)]">
                <input
                  type="checkbox"
                  checked={banForm.revokeSessions}
                  onChange={(event) =>
                    setBanForm((prev) => ({
                      ...prev,
                      revokeSessions: event.target.checked,
                    }))
                  }
                />
                Revoke sessions now
              </label>

              {banFormError ? (
                <p className="text-sm text-rose-400" role="alert">
                  {banFormError}
                </p>
              ) : null}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                type="button"
                className="h-9 w-auto border border-[var(--theme-border)] bg-transparent px-4 text-sm"
                onClick={() => setBanModal(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-9 w-auto bg-rose-500 px-4 text-sm text-white hover:bg-rose-600 focus-visible:ring-rose-400"
                onClick={() => void submitBan()}
              >
                Ban user
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default HomePage;
