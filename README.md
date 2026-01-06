# Iced

Iced is a multi-tenant authentication and licensing platform that helps you ship
end-user access, ranks/permissions, licenses, and audit visibility without
building the entire system from scratch.

## Product surfaces

- **Dashboard**: Developer-facing console for creating applications, API keys,
  ranks, permissions, licenses, and viewing event logs.
- **Public Auth API (/v1)**: End-user authentication API that your product calls
  using an application API key (register, login, refresh, logout, and `me`).
- **Owner Panel**: Platform owner console for managing developers, applications,
  and API keys at the organization level.

## Local setup

1. Copy `.env.example` to `.env` and populate required values:
   - `DATABASE_URL`
   - `OWNER_EMAIL`
   - `OWNER_PASSWORD_HASH`
   - `JWT_SECRET`
   - `WEBHOOK_SECRET_KEY`
2. Start the API service (from `apps/api`) with your preferred package manager.
3. Start the Dashboard (`apps/dashboard`) and Owner Panel (`apps/owner`) apps for
   their UIs.

### Development ports

Iced uses fixed development ports and will fail fast if any are already in use:

- Dashboard: http://127.0.0.1:3001
- API: http://127.0.0.1:3002
- Owner Panel: http://127.0.0.1:3003

### Dashboard API URL

The dashboard proxies API calls using `NEXT_PUBLIC_API_URL`.

- Default (dev): `http://127.0.0.1:3002`
- Example override: `NEXT_PUBLIC_API_URL=https://api.example.com`

`NEXT_PUBLIC_API_URL` must include a protocol and must not point to the dashboard
origin/port.

### Running all services

Use the dev launcher to start everything with the correct ports:

```powershell
./run-dev.cmd
```

### Troubleshooting

- **Port already in use**: stop the process holding the port (3001-3003) and rerun.
- **Dashboard can't register/login**: confirm the API is running on 3002 and
  `NEXT_PUBLIC_API_URL` is set correctly.

## Create an application

1. Sign in to the **Dashboard**.
2. Create a new application from the dashboard home screen.
3. Generate an API key for the application under the application settings.
4. Use that API key to call the Public Auth API.

## Integrate authentication

1. Send requests to `/v1/auth/register` or `/v1/auth/login` with:
   - `x-api-key: <application api key>`
   - JSON body containing `email` and `password` (and `license_key` if required)
2. Store the returned `access_token` and `refresh_token`.
3. Use the `access_token` as a bearer token when calling `/v1/me`.
4. Refresh tokens via `/v1/auth/refresh` when access tokens expire.
5. Call `/v1/auth/logout` to revoke refresh tokens on sign-out.

The OpenAPI specification for the Public Auth API lives at
`openapi/public-auth.yaml`.

## Ranks, permissions, and licenses

- **Ranks** define the role of an end user inside an application.
- **Permissions** are attached to ranks to model capabilities.
- **Licenses** can gate registration or unlock specific ranks.

Manage these in the Dashboard via the ranks, permissions, and licenses sections
for each application.

## Event logs and API key visibility

The Dashboard surfaces event logs (such as logins and API key usage) per
application. API key usage events are captured automatically when requests are
made using an API key, so you can track key activity and troubleshoot access.
