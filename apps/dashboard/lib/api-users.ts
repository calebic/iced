export type BanUserPayload = {
  duration_seconds?: number;
  banned_until?: string;
  permanent?: boolean;
  reason?: string;
  revoke_sessions?: boolean;
};

export const banUser = async (
  appId: string,
  userId: string,
  payload: BanUserPayload,
) =>
  fetch(`/dashboard/apps/${appId}/users/${userId}/ban`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

export const unbanUser = async (appId: string, userId: string) =>
  fetch(`/dashboard/apps/${appId}/users/${userId}/unban`, {
    method: "POST",
    credentials: "include",
  });
