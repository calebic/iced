"use client";

import { useEffect, useRef, useState } from "react";
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

type License = {
  id: string;
  rank_id: string;
  pool_id: string | null;
  status: "active" | "redeemed" | "revoked" | "expired";
  max_uses: number | null;
  use_count: number;
  duration_seconds: number | null;
  expires_at: string | null;
  redeemed_at: string | null;
  redeemed_by_id: string | null;
  revoked_at: string | null;
  created_at: string;
};

type LicenseFormState = {
  rankId: string;
  maxUses: string;
  durationSeconds: string;
  expiresAt: string;
  isSubmitting: boolean;
  error: string;
  keys: string[];
};

type RankFormState = {
  name: string;
  permissionIds: string[];
  newPermissions: string;
  isSubmitting: boolean;
  error: string;
};

type LicenseState = {
  items: License[];
  isLoading: boolean;
  error: string;
  emptyMessage: string;
  form: LicenseFormState;
  rankForm: RankFormState;
  showList: boolean;
  isRankModalOpen: boolean;
  isLicenseModalOpen: boolean;
  keysById: Record<string, string>;
};

type Permission = {
  id: string;
  name: string;
};

type PermissionsState = {
  items: Permission[];
  isLoading: boolean;
  error: string;
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
  const [licensesByApp, setLicensesByApp] = useState<Record<string, LicenseState>>(
    {},
  );
  const [permissionsByApp, setPermissionsByApp] = useState<
    Record<string, PermissionsState>
  >({});
  const loadedUsersRef = useRef(new Set<string>());
  const loadedApiKeyRef = useRef(new Set<string>());
  const loadedLicensesRef = useRef(new Set<string>());
  const loadedPermissionsRef = useRef(new Set<string>());

  const getMaskedKey = (last4?: string | null) =>
    last4 ? `••••••${last4}` : "••••••";

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
    if (!expandedAppId) {
      return;
    }

    const shouldLoadUsers = !loadedUsersRef.current.has(expandedAppId);
    const shouldLoadApiKey = !loadedApiKeyRef.current.has(expandedAppId);
    const shouldLoadLicenses = !loadedLicensesRef.current.has(expandedAppId);
    const shouldLoadPermissions = !loadedPermissionsRef.current.has(expandedAppId);

    if (
      !shouldLoadUsers &&
      !shouldLoadApiKey &&
      !shouldLoadLicenses &&
      !shouldLoadPermissions
    ) {
      return;
    }

    const loadUsers = async () => {
      loadedUsersRef.current.add(expandedAppId);
      loadedPermissionsRef.current.add(expandedAppId);
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
        const [usersResponse, ranksResponse, permissionsResponse] = await Promise.all([
          fetch(`/dashboard/apps/${expandedAppId}/users`, {
            credentials: "include",
          }),
          fetch(`/dashboard/apps/${expandedAppId}/ranks`, {
            credentials: "include",
          }),
          fetch(`/dashboard/apps/${expandedAppId}/permissions`, {
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
        const permissionsPayload = permissionsResponse.ok
          ? ((await permissionsResponse.json()) as {
              success: boolean;
              data?: Permission[];
            })
          : { success: false };

        const users = usersPayload.success ? usersPayload.data?.items ?? [] : [];
        const ranks = ranksPayload.success && ranksPayload.data ? ranksPayload.data : [];
        const permissions =
          permissionsPayload.success && permissionsPayload.data
            ? permissionsPayload.data
            : [];

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
        setPermissionsByApp((prev) => ({
          ...prev,
          [expandedAppId]: {
            items: permissions,
            isLoading: false,
            error: permissionsPayload.success
              ? ""
              : "Unable to load permissions. Please try again.",
          },
        }));

        setLicensesByApp((prev) => {
          const current = prev[expandedAppId];
          if (!current || current.form.rankId || ranks.length === 0) {
            return prev;
          }
          return {
            ...prev,
            [expandedAppId]: {
              ...current,
              form: {
                ...current.form,
                rankId: ranks[0]?.id ?? "",
              },
            },
          };
        });
      } catch {
        setUsersByApp((prev) => ({
          ...prev,
          [expandedAppId]: {
            ...prev[expandedAppId],
            isLoading: false,
            error: "Unable to load users. Please try again.",
          },
        }));
        setPermissionsByApp((prev) => ({
          ...prev,
          [expandedAppId]: {
            items: [],
            isLoading: false,
            error: "Unable to load permissions. Please try again.",
          },
        }));
      }
    };

    const loadApiKey = async () => {
      loadedApiKeyRef.current.add(expandedAppId);
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

    const loadLicenses = async () => {
      loadedLicensesRef.current.add(expandedAppId);
      const initialRankForm: RankFormState = {
        name: "",
        permissionIds: [],
        newPermissions: "",
        isSubmitting: false,
        error: "",
      };
      const initialForm: LicenseFormState = {
        rankId: "",
        maxUses: "",
        durationSeconds: "",
        expiresAt: "",
        isSubmitting: false,
        error: "",
        keys: [],
      };

      setLicensesByApp((prev) => ({
        ...prev,
        [expandedAppId]: {
          items: prev[expandedAppId]?.items ?? [],
          isLoading: true,
          error: "",
          emptyMessage: "No licenses generated yet.",
          form: prev[expandedAppId]?.form ?? initialForm,
          rankForm: prev[expandedAppId]?.rankForm ?? initialRankForm,
          showList: prev[expandedAppId]?.showList ?? false,
          isRankModalOpen: prev[expandedAppId]?.isRankModalOpen ?? false,
          isLicenseModalOpen: prev[expandedAppId]?.isLicenseModalOpen ?? false,
          keysById: prev[expandedAppId]?.keysById ?? {},
        },
      }));

      try {
        const response = await fetch(`/dashboard/apps/${expandedAppId}/licenses`, {
          credentials: "include",
        });

        if (!response.ok) {
          setLicensesByApp((prev) => ({
            ...prev,
            [expandedAppId]: {
              ...prev[expandedAppId],
              isLoading: false,
              error: "Unable to load licenses. Please try again.",
            },
          }));
          return;
        }

        const payload = (await response.json()) as {
          success: boolean;
          data?: { items: License[] };
        };

        const items = payload.success ? payload.data?.items ?? [] : [];

        setLicensesByApp((prev) => ({
          ...prev,
          [expandedAppId]: {
            ...prev[expandedAppId],
            items,
            isLoading: false,
            error: payload.success ? "" : "Unable to load licenses. Please try again.",
            emptyMessage: items.length === 0 ? "No licenses generated yet." : "",
          },
        }));
      } catch {
        setLicensesByApp((prev) => ({
          ...prev,
          [expandedAppId]: {
            ...prev[expandedAppId],
            isLoading: false,
            error: "Unable to load licenses. Please try again.",
          },
        }));
      }
    };

    if (shouldLoadUsers || shouldLoadPermissions) {
      void loadUsers();
    }
    if (shouldLoadApiKey) {
      void loadApiKey();
    }
    if (shouldLoadLicenses) {
      void loadLicenses();
    }
  }, [expandedAppId]);

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

  const updateLicenseForm = (
    appId: string,
    updates: Partial<LicenseFormState>,
  ) => {
    setLicensesByApp((prev) => ({
      ...prev,
      [appId]: prev[appId]
        ? {
            ...prev[appId],
            form: {
              ...prev[appId].form,
              ...updates,
            },
          }
        : {
            items: [],
            isLoading: false,
            error: "",
            emptyMessage: "",
            form: {
              rankId: "",
              maxUses: "",
              durationSeconds: "",
              expiresAt: "",
              isSubmitting: false,
              error: "",
              keys: [],
              ...updates,
            },
            rankForm: {
              name: "",
              permissionIds: [],
              newPermissions: "",
              isSubmitting: false,
              error: "",
            },
            showList: false,
            isRankModalOpen: false,
            isLicenseModalOpen: false,
            keysById: {},
          },
    }));
  };

  const updateRankForm = (appId: string, updates: Partial<RankFormState>) => {
    setLicensesByApp((prev) => ({
      ...prev,
      [appId]: prev[appId]
        ? {
            ...prev[appId],
            rankForm: {
              ...prev[appId].rankForm,
              ...updates,
            },
          }
        : {
            items: [],
            isLoading: false,
            error: "",
            emptyMessage: "",
            form: {
              rankId: "",
              maxUses: "",
              durationSeconds: "",
              expiresAt: "",
              isSubmitting: false,
              error: "",
              keys: [],
            },
            rankForm: {
              name: "",
              permissionIds: [],
              newPermissions: "",
              isSubmitting: false,
              error: "",
              ...updates,
            },
            showList: false,
            isRankModalOpen: false,
            isLicenseModalOpen: false,
            keysById: {},
          },
    }));
  };

  const toggleLicenseList = (appId: string) => {
    setLicensesByApp((prev) => ({
      ...prev,
      [appId]: prev[appId]
        ? {
            ...prev[appId],
            showList: !prev[appId].showList,
          }
        : {
            items: [],
            isLoading: false,
            error: "",
            emptyMessage: "",
            form: {
              rankId: "",
              maxUses: "",
              durationSeconds: "",
              expiresAt: "",
              isSubmitting: false,
              error: "",
              keys: [],
            },
            rankForm: {
              name: "",
              permissionIds: [],
              newPermissions: "",
              isSubmitting: false,
              error: "",
            },
            showList: true,
            isRankModalOpen: false,
            isLicenseModalOpen: false,
            keysById: {},
          },
    }));
  };

  const toggleRankModal = (appId: string, isOpen: boolean) => {
    setLicensesByApp((prev) => ({
      ...prev,
      [appId]: prev[appId]
        ? {
            ...prev[appId],
            isRankModalOpen: isOpen,
            rankForm: isOpen
              ? prev[appId].rankForm
              : {
                  ...prev[appId].rankForm,
                  error: "",
                },
          }
        : {
            items: [],
            isLoading: false,
            error: "",
            emptyMessage: "",
            form: {
              rankId: "",
              maxUses: "",
              durationSeconds: "",
              expiresAt: "",
              isSubmitting: false,
              error: "",
              keys: [],
            },
            rankForm: {
              name: "",
              permissionIds: [],
              newPermissions: "",
              isSubmitting: false,
              error: "",
            },
            showList: false,
            isRankModalOpen: isOpen,
            isLicenseModalOpen: false,
            keysById: {},
          },
    }));
  };

  const toggleLicenseModal = (appId: string, isOpen: boolean) => {
    setLicensesByApp((prev) => ({
      ...prev,
      [appId]: prev[appId]
        ? {
            ...prev[appId],
            isLicenseModalOpen: isOpen,
            form: isOpen
              ? prev[appId].form
              : {
                  ...prev[appId].form,
                  error: "",
                  keys: [],
                },
          }
        : {
            items: [],
            isLoading: false,
            error: "",
            emptyMessage: "",
            form: {
              rankId: "",
              maxUses: "",
              durationSeconds: "",
              expiresAt: "",
              isSubmitting: false,
              error: "",
              keys: [],
            },
            rankForm: {
              name: "",
              permissionIds: [],
              newPermissions: "",
              isSubmitting: false,
              error: "",
            },
            showList: false,
            isRankModalOpen: false,
            isLicenseModalOpen: isOpen,
            keysById: {},
          },
    }));
  };

  const togglePermissionSelection = (appId: string, permissionId: string) => {
    setLicensesByApp((prev) => ({
      ...prev,
      [appId]: prev[appId]
        ? {
            ...prev[appId],
            rankForm: {
              ...prev[appId].rankForm,
              permissionIds: prev[appId].rankForm.permissionIds.includes(
                permissionId,
              )
                ? prev[appId].rankForm.permissionIds.filter(
                    (item) => item !== permissionId,
                  )
                : [...prev[appId].rankForm.permissionIds, permissionId],
            },
          }
        : prev[appId],
    }));
  };

  const parsePermissionNames = (value: string) =>
    value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

  const createRank = async (appId: string) => {
    const licenseState = licensesByApp[appId];
    const permissionState = permissionsByApp[appId];
    if (!licenseState) return;

    const { name, permissionIds, newPermissions } = licenseState.rankForm;
    if (!name.trim()) {
      updateRankForm(appId, { error: "Enter a rank name." });
      return;
    }

    updateRankForm(appId, { isSubmitting: true, error: "" });

    try {
      const existingPermissions = permissionState?.items ?? [];
      const existingNames = new Set(
        existingPermissions.map((permission) => permission.name.toLowerCase()),
      );
      const requestedNames = parsePermissionNames(newPermissions);
      const uniqueNames = Array.from(
        new Set(requestedNames.map((item) => item.toLowerCase())),
      ).filter((item) => !existingNames.has(item));

      const createdPermissions = await Promise.all(
        uniqueNames.map(async (permissionName) => {
          const response = await fetch(`/dashboard/apps/${appId}/permissions`, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: permissionName }),
          });

          if (!response.ok) {
            throw new Error("Unable to create permission.");
          }

          const payload = (await response.json()) as {
            success: boolean;
            data?: Permission;
          };

          if (!payload.success || !payload.data) {
            throw new Error("Unable to create permission.");
          }

          return payload.data;
        }),
      );

      const response = await fetch(`/dashboard/apps/${appId}/ranks`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          priority: 0,
        }),
      });

      if (!response.ok) {
        updateRankForm(appId, {
          isSubmitting: false,
          error: "Unable to create rank. Please try again.",
        });
        return;
      }

      const payload = (await response.json()) as {
        success: boolean;
        data?: Rank;
      };

      if (!payload.success || !payload.data) {
        updateRankForm(appId, {
          isSubmitting: false,
          error: "Unable to create rank. Please try again.",
        });
        return;
      }

      const permissionIdsToAssign = [
        ...permissionIds,
        ...createdPermissions.map((permission) => permission.id),
      ];

      if (permissionIdsToAssign.length > 0) {
        const assignResponse = await fetch(
          `/dashboard/apps/${appId}/ranks/${payload.data.id}/permissions`,
          {
            method: "PUT",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              permission_ids: permissionIdsToAssign,
            }),
          },
        );

        if (!assignResponse.ok) {
          updateRankForm(appId, {
            isSubmitting: false,
            error: "Rank created, but permissions could not be assigned.",
          });
          return;
        }
      }

      setUsersByApp((prev) => ({
        ...prev,
        [appId]: prev[appId]
          ? {
              ...prev[appId],
              ranks: [...prev[appId].ranks, payload.data!],
            }
          : {
              items: [],
              ranks: [payload.data],
              isLoading: false,
              error: "",
              emptyMessage: "",
            },
      }));

      updateRankForm(appId, {
        name: "",
        permissionIds: [],
        newPermissions: "",
        isSubmitting: false,
        error: "",
      });

      if (createdPermissions.length > 0) {
        setPermissionsByApp((prev) => ({
          ...prev,
          [appId]: {
            items: [...(prev[appId]?.items ?? []), ...createdPermissions],
            isLoading: false,
            error: "",
          },
        }));
      }

      if (!licenseState.form.rankId) {
        updateLicenseForm(appId, { rankId: payload.data.id });
      }
    } catch {
      updateRankForm(appId, {
        isSubmitting: false,
        error: "Unable to create rank. Please try again.",
      });
    }
  };

  const createLicense = async (appId: string) => {
    const licenseState = licensesByApp[appId];
    if (!licenseState) return;

    const { rankId, maxUses, durationSeconds, expiresAt } = licenseState.form;

    if (!rankId) {
      updateLicenseForm(appId, { error: "Select a rank for the license." });
      return;
    }

    const parsedMaxUses =
      maxUses.trim() === "" ? undefined : Number.parseInt(maxUses, 10);
    if (parsedMaxUses !== undefined && (!Number.isFinite(parsedMaxUses) || parsedMaxUses <= 0)) {
      updateLicenseForm(appId, { error: "Max uses must be a positive number." });
      return;
    }

    const parsedDuration =
      durationSeconds.trim() === "" ? undefined : Number.parseInt(durationSeconds, 10);
    if (parsedDuration !== undefined && (!Number.isFinite(parsedDuration) || parsedDuration <= 0)) {
      updateLicenseForm(appId, {
        error: "Duration must be a positive number of seconds.",
      });
      return;
    }

    const expiresAtValue = expiresAt.trim();
    if (expiresAtValue && Number.isNaN(Date.parse(expiresAtValue))) {
      updateLicenseForm(appId, { error: "Expiration date is invalid." });
      return;
    }
    const expiresAtIso = expiresAtValue ? new Date(expiresAtValue).toISOString() : undefined;

    updateLicenseForm(appId, { isSubmitting: true, error: "", keys: [] });

    try {
      const response = await fetch(`/dashboard/apps/${appId}/licenses`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rank_id: rankId,
          max_uses: parsedMaxUses,
          duration_seconds: parsedDuration,
          expires_at: expiresAtIso,
        }),
      });

      if (!response.ok) {
        updateLicenseForm(appId, {
          isSubmitting: false,
          error: "Unable to generate the license. Please try again.",
        });
        return;
      }

      const payload = (await response.json()) as {
        success: boolean;
        data?: { license: License; keys: string[] };
      };

      if (!payload.success || !payload.data) {
        updateLicenseForm(appId, {
          isSubmitting: false,
          error: "Unable to generate the license. Please try again.",
        });
        return;
      }

      setLicensesByApp((prev) => ({
        ...prev,
        [appId]: {
          ...prev[appId],
          items: [payload.data.license, ...prev[appId].items],
          keysById: {
            ...prev[appId].keysById,
            [payload.data.license.id]: payload.data.keys[0] ?? "",
          },
          form: {
            ...prev[appId].form,
            isSubmitting: false,
            error: "",
            keys: payload.data.keys,
            maxUses: "",
            durationSeconds: "",
            expiresAt: "",
          },
        },
      }));
    } catch {
      updateLicenseForm(appId, {
        isSubmitting: false,
        error: "Unable to generate the license. Please try again.",
      });
    }
  };

  const copyLicenseKey = async (appId: string, key: string) => {
    try {
      await navigator.clipboard.writeText(key);
    } catch {
      updateLicenseForm(appId, {
        error: "Unable to copy the license key. Please copy manually.",
      });
    }
  };

  const revokeLicense = async (appId: string, licenseId: string) => {
    const confirmRevoke = window.confirm("Revoke this license?");
    if (!confirmRevoke) return;

    setLicensesByApp((prev) => ({
      ...prev,
      [appId]: prev[appId]
        ? {
            ...prev[appId],
            error: "",
          }
        : {
            items: [],
            isLoading: false,
            error: "",
            emptyMessage: "",
            form: {
              rankId: "",
              maxUses: "",
              durationSeconds: "",
              expiresAt: "",
              isSubmitting: false,
              error: "",
              keys: [],
            },
            rankForm: {
              name: "",
              permissionIds: [],
              newPermissions: "",
              isSubmitting: false,
              error: "",
            },
            showList: false,
            isRankModalOpen: false,
            isLicenseModalOpen: false,
            keysById: {},
          },
    }));

    try {
      const response = await fetch(
        `/dashboard/apps/${appId}/licenses/${licenseId}/revoke`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      if (!response.ok) {
        setLicensesByApp((prev) => ({
          ...prev,
          [appId]: {
            ...prev[appId],
            error: "Unable to revoke the license. Please try again.",
          },
        }));
        return;
      }

      const payload = (await response.json()) as {
        success: boolean;
        data?: { license: License };
      };

      if (!payload.success || !payload.data) {
        setLicensesByApp((prev) => ({
          ...prev,
          [appId]: {
            ...prev[appId],
            error: "Unable to revoke the license. Please try again.",
          },
        }));
        return;
      }

      setLicensesByApp((prev) => ({
        ...prev,
        [appId]: {
          ...prev[appId],
          items: prev[appId].items.map((license) =>
            license.id === licenseId ? payload.data!.license : license,
          ),
        },
      }));
    } catch {
      setLicensesByApp((prev) => ({
        ...prev,
        [appId]: {
          ...prev[appId],
          error: "Unable to revoke the license. Please try again.",
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
              const apiKeyState = apiKeysByApp[app.id];
              const licenseState = licensesByApp[app.id];
              const ranks = usersState?.ranks ?? [];
              const rankNameById = new Map(ranks.map((rank) => [rank.id, rank.name]));

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
                        <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-panel-bg)] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold text-[var(--theme-fg)]">
                                Licenses
                              </h3>
                              <p className="mt-1 text-sm text-[var(--theme-muted-strong)]">
                                Create ranks and issue license codes.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                className="h-9 w-auto px-4"
                                onClick={() => toggleRankModal(app.id, true)}
                              >
                                Create rank
                              </Button>
                              <Button
                                type="button"
                                className="h-9 w-auto border border-[var(--theme-border)] bg-transparent px-4 text-[var(--theme-fg)] hover:bg-[var(--theme-panel-bg)]"
                                onClick={() => toggleLicenseModal(app.id, true)}
                                disabled={ranks.length === 0}
                              >
                                Generate license
                              </Button>
                            </div>
                          </div>
                          {licenseState?.error ? (
                            <p className="mt-2 text-sm text-rose-400" role="alert">
                              {licenseState.error}
                            </p>
                          ) : null}
                          <div className="mt-4">
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-[var(--theme-muted-strong)]">
                                {licenseState?.items.length ?? 0} licenses
                              </p>
                              <Button
                                type="button"
                                className="h-7 w-auto border border-[var(--theme-border)] bg-transparent px-2 text-[11px] text-[var(--theme-fg)] hover:bg-[var(--theme-panel-bg)]"
                                onClick={() => toggleLicenseList(app.id)}
                                disabled={!licenseState}
                              >
                                {licenseState?.showList ? "Hide list" : "Show list"}
                              </Button>
                            </div>
                          </div>
                          {licenseState?.showList ? (
                            <div className="mt-3">
                              {!licenseState || licenseState.isLoading ? (
                                <p className="text-sm text-[var(--theme-muted-strong)]">
                                  Loading licenses…
                                </p>
                              ) : licenseState.error ? (
                                <p className="text-sm text-rose-400" role="alert">
                                  {licenseState.error}
                                </p>
                              ) : licenseState.items.length === 0 ? (
                                <p className="text-sm text-[var(--theme-muted-strong)]">
                                  {licenseState.emptyMessage}
                                </p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-sm text-[var(--theme-fg)]">
                                    <thead className="text-xs uppercase text-[var(--theme-muted-strong)]">
                                      <tr>
                                        <th className="py-2">Status</th>
                                        <th className="py-2">Code</th>
                                        <th className="py-2">Rank</th>
                                        <th className="py-2">Uses</th>
                                        <th className="py-2">Expires</th>
                                        <th className="py-2">Created</th>
                                        <th className="py-2">Redeemed</th>
                                        <th className="py-2 text-right">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--theme-border)]">
                                      {licenseState.items.map((license) => (
                                        <tr key={license.id} className="align-top">
                                          <td className="py-3 capitalize">
                                            {license.status}
                                          </td>
                                          <td className="py-3 font-mono text-xs">
                                            {licenseState.keysById[license.id] ?? "—"}
                                          </td>
                                          <td className="py-3">
                                            {rankNameById.get(license.rank_id) ??
                                              license.rank_id}
                                          </td>
                                          <td className="py-3">
                                            {license.use_count}
                                            {license.max_uses
                                              ? ` / ${license.max_uses}`
                                              : " / ∞"}
                                          </td>
                                          <td className="py-3">
                                            {license.expires_at
                                              ? formatDate(license.expires_at)
                                              : "—"}
                                          </td>
                                          <td className="py-3">
                                            {formatDate(license.created_at)}
                                          </td>
                                          <td className="py-3">
                                            {license.redeemed_at
                                              ? formatDate(license.redeemed_at)
                                              : "—"}
                                          </td>
                                          <td className="py-3 text-right">
                                            <Button
                                              type="button"
                                              className="h-8 w-auto px-3"
                                              disabled={license.status !== "active"}
                                              onClick={() =>
                                                revokeLicense(app.id, license.id)
                                              }
                                            >
                                              Revoke
                                            </Button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          ) : null}
                          {licenseState?.isRankModalOpen ? (
                            <div
                              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                              role="dialog"
                              aria-modal="true"
                              onClick={() => toggleRankModal(app.id, false)}
                            >
                              <div
                                className="w-full max-w-2xl rounded-lg border border-[var(--theme-border)] bg-[var(--theme-panel-bg)] p-6 text-left shadow-lg"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <h4 className="text-lg font-semibold text-[var(--theme-fg)]">
                                      Create rank
                                    </h4>
                                    <p className="text-sm text-[var(--theme-muted-strong)]">
                                      Assign permissions like moderator.kick or moderator.ban.
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    className="h-8 w-auto border border-[var(--theme-border)] bg-transparent px-3 text-[11px] text-[var(--theme-fg)] hover:bg-[var(--theme-panel-bg)]"
                                    onClick={() => toggleRankModal(app.id, false)}
                                  >
                                    Close
                                  </Button>
                                </div>
                                {licenseState.rankForm.error ? (
                                  <p className="mt-3 text-sm text-rose-400" role="alert">
                                    {licenseState.rankForm.error}
                                  </p>
                                ) : null}
                                <div className="mt-4 space-y-4">
                                  <div className="space-y-2">
                                    <Label htmlFor={`rank-name-${app.id}`}>
                                      Rank name
                                    </Label>
                                    <Input
                                      id={`rank-name-${app.id}`}
                                      value={licenseState.rankForm.name}
                                      onChange={(event) =>
                                        updateRankForm(app.id, {
                                          name: event.target.value,
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor={`rank-permissions-${app.id}`}>
                                      Permissions
                                    </Label>
                                    {permissionsByApp[app.id]?.isLoading ? (
                                      <p className="text-sm text-[var(--theme-muted-strong)]">
                                        Loading permissions…
                                      </p>
                                    ) : permissionsByApp[app.id]?.error ? (
                                      <p
                                        className="text-sm text-rose-400"
                                        role="alert"
                                      >
                                        {permissionsByApp[app.id].error}
                                      </p>
                                    ) : permissionsByApp[app.id]?.items.length ? (
                                      <div className="grid gap-2 sm:grid-cols-2">
                                        {permissionsByApp[app.id].items.map(
                                          (permission) => (
                                            <label
                                              key={permission.id}
                                              className="flex items-center gap-2 text-sm text-[var(--theme-fg)]"
                                            >
                                              <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border border-[var(--theme-input-border)] bg-[var(--theme-input-bg)]"
                                                checked={licenseState.rankForm.permissionIds.includes(
                                                  permission.id,
                                                )}
                                                onChange={() =>
                                                  togglePermissionSelection(
                                                    app.id,
                                                    permission.id,
                                                  )
                                                }
                                              />
                                              <span>{permission.name}</span>
                                            </label>
                                          ),
                                        )}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-[var(--theme-muted-strong)]">
                                        No permissions yet. Add some below.
                                      </p>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor={`rank-new-permissions-${app.id}`}>
                                      Add permissions
                                    </Label>
                                    <Input
                                      id={`rank-new-permissions-${app.id}`}
                                      placeholder="moderator.kick, moderator.ban"
                                      value={licenseState.rankForm.newPermissions}
                                      onChange={(event) =>
                                        updateRankForm(app.id, {
                                          newPermissions: event.target.value,
                                        })
                                      }
                                    />
                                    <p className="text-xs text-[var(--theme-muted-strong)]">
                                      Separate multiple permissions with commas or new lines.
                                    </p>
                                  </div>
                                  <div className="flex justify-end">
                                    <Button
                                      type="button"
                                      onClick={() => createRank(app.id)}
                                      disabled={licenseState.rankForm.isSubmitting}
                                      className="h-9 w-auto px-4"
                                    >
                                      {licenseState.rankForm.isSubmitting
                                        ? "Creating…"
                                        : "Create rank"}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {licenseState?.isLicenseModalOpen ? (
                            <div
                              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                              role="dialog"
                              aria-modal="true"
                              onClick={() => toggleLicenseModal(app.id, false)}
                            >
                              <div
                                className="w-full max-w-2xl rounded-lg border border-[var(--theme-border)] bg-[var(--theme-panel-bg)] p-6 text-left shadow-lg"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <h4 className="text-lg font-semibold text-[var(--theme-fg)]">
                                      Generate license
                                    </h4>
                                    <p className="text-sm text-[var(--theme-muted-strong)]">
                                      Licenses grant the selected rank on redemption.
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    className="h-8 w-auto border border-[var(--theme-border)] bg-transparent px-3 text-[11px] text-[var(--theme-fg)] hover:bg-[var(--theme-panel-bg)]"
                                    onClick={() => toggleLicenseModal(app.id, false)}
                                  >
                                    Close
                                  </Button>
                                </div>
                                {licenseState.form.error ? (
                                  <p className="mt-3 text-sm text-rose-400" role="alert">
                                    {licenseState.form.error}
                                  </p>
                                ) : null}
                                <div className="mt-4 space-y-4">
                                  <div className="space-y-2">
                                    <Label htmlFor={`license-rank-${app.id}`}>
                                      Rank
                                    </Label>
                                    <select
                                      id={`license-rank-${app.id}`}
                                      className="h-9 w-full rounded-md border border-[var(--theme-input-border)] bg-[var(--theme-input-bg)] px-2 text-sm text-[var(--theme-input-text)]"
                                      value={licenseState.form.rankId}
                                      onChange={(event) =>
                                        updateLicenseForm(app.id, {
                                          rankId: event.target.value,
                                        })
                                      }
                                      disabled={ranks.length === 0}
                                    >
                                      <option value="">
                                        {ranks.length === 0
                                          ? "Create a rank first"
                                          : "Select a rank"}
                                      </option>
                                      {ranks.map((rank) => (
                                        <option key={rank.id} value={rank.id}>
                                          {rank.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-2">
                                      <Label htmlFor={`license-max-uses-${app.id}`}>
                                        Max uses
                                      </Label>
                                      <Input
                                        id={`license-max-uses-${app.id}`}
                                        type="number"
                                        min="1"
                                        value={licenseState.form.maxUses}
                                        onChange={(event) =>
                                          updateLicenseForm(app.id, {
                                            maxUses: event.target.value,
                                          })
                                        }
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor={`license-duration-${app.id}`}>
                                        Rank duration (seconds)
                                      </Label>
                                      <Input
                                        id={`license-duration-${app.id}`}
                                        type="number"
                                        min="1"
                                        value={licenseState.form.durationSeconds}
                                        onChange={(event) =>
                                          updateLicenseForm(app.id, {
                                            durationSeconds: event.target.value,
                                          })
                                        }
                                      />
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                      <Label htmlFor={`license-expires-${app.id}`}>
                                        License expiration
                                      </Label>
                                      <Input
                                        id={`license-expires-${app.id}`}
                                        type="datetime-local"
                                        value={licenseState.form.expiresAt}
                                        onChange={(event) =>
                                          updateLicenseForm(app.id, {
                                            expiresAt: event.target.value,
                                          })
                                        }
                                      />
                                    </div>
                                  </div>
                                  <div className="flex justify-end">
                                    <Button
                                      type="button"
                                      onClick={() => createLicense(app.id)}
                                      disabled={
                                        licenseState.form.isSubmitting ||
                                        ranks.length === 0
                                      }
                                      className="h-9 w-auto px-4"
                                    >
                                      {licenseState.form.isSubmitting
                                        ? "Generating…"
                                        : "Generate license"}
                                    </Button>
                                  </div>
                                  {licenseState.form.keys.length ? (
                                    <div className="space-y-2 rounded-md border border-[var(--theme-border)] bg-[var(--theme-panel-bg)] p-3">
                                      <p className="text-xs text-amber-500">
                                        Copy these keys now — they won’t be shown again.
                                      </p>
                                      <div className="space-y-2 text-sm font-mono">
                                        {licenseState.form.keys.map((key) => (
                                          <div
                                            key={key}
                                            className="flex flex-wrap items-center justify-between gap-2"
                                          >
                                            <span className="break-all">{key}</span>
                                            <Button
                                              type="button"
                                              className="h-7 w-auto border border-[var(--theme-border)] bg-transparent px-2 text-[11px] text-[var(--theme-fg)] hover:bg-[var(--theme-panel-bg)]"
                                              onClick={() =>
                                                copyLicenseKey(app.id, key)
                                              }
                                            >
                                              Copy
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ) : null}
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
                              <label className="flex items-center gap-2 text-sm text-[var(--theme-fg)]">
                                <input
                                  id={`email-policy-${app.id}`}
                                  type="checkbox"
                                  className="h-4 w-4 rounded border border-[var(--theme-input-border)] bg-[var(--theme-input-bg)]"
                                  checked={app.email_policy === "required"}
                                  onChange={(event) =>
                                    updateRegistrationPolicies(app.id, {
                                      email_policy: event.target.checked
                                        ? "required"
                                        : "optional",
                                    })
                                  }
                                />
                                Required
                              </label>
                              <p className="text-xs text-[var(--theme-muted-strong)]">
                                Toggle on to require email during registration.
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`license-policy-${app.id}`}>
                                License policy
                              </Label>
                              <label className="flex items-center gap-2 text-sm text-[var(--theme-fg)]">
                                <input
                                  id={`license-policy-${app.id}`}
                                  type="checkbox"
                                  className="h-4 w-4 rounded border border-[var(--theme-input-border)] bg-[var(--theme-input-bg)]"
                                  checked={app.license_policy === "required"}
                                  onChange={(event) =>
                                    updateRegistrationPolicies(app.id, {
                                      license_policy: event.target.checked
                                        ? "required"
                                        : "optional",
                                    })
                                  }
                                />
                                Required
                              </label>
                              <p className="text-xs text-[var(--theme-muted-strong)]">
                                Toggle on to require a license code during registration.
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
    </section>
  );
};

export default HomePage;
