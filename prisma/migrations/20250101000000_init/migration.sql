CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "DeveloperStatus" AS ENUM ('active', 'disabled');
CREATE TYPE "ApplicationStatus" AS ENUM ('active', 'disabled');
CREATE TYPE "LicenseStatus" AS ENUM ('active', 'redeemed', 'revoked', 'expired');
CREATE TYPE "ActorType" AS ENUM ('owner', 'developer', 'end_user');

CREATE TABLE "owner_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "owner_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "owner_users_email_key" ON "owner_users"("email");

CREATE TABLE "owner_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_user_id" UUID NOT NULL,
    "session_token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "owner_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "owner_sessions_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "owner_users"("id") ON DELETE CASCADE
);

CREATE INDEX "owner_sessions_owner_user_id_idx" ON "owner_sessions"("owner_user_id");
CREATE INDEX "owner_sessions_expires_at_idx" ON "owner_sessions"("expires_at");

CREATE TABLE "developer_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "DeveloperStatus" NOT NULL DEFAULT 'active',
    "disabled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "developer_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "developer_users_email_key" ON "developer_users"("email");
CREATE INDEX "developer_users_status_idx" ON "developer_users"("status");

CREATE TABLE "developer_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "developer_user_id" UUID NOT NULL,
    "session_token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "developer_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "developer_sessions_developer_user_id_fkey" FOREIGN KEY ("developer_user_id") REFERENCES "developer_users"("id") ON DELETE CASCADE
);

CREATE INDEX "developer_sessions_developer_user_id_idx" ON "developer_sessions"("developer_user_id");
CREATE INDEX "developer_sessions_expires_at_idx" ON "developer_sessions"("expires_at");

CREATE TABLE "applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "developer_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'active',
    "allowed_origins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "access_token_ttl_seconds" INTEGER NOT NULL,
    "refresh_token_ttl_seconds" INTEGER NOT NULL,
    "license_required_on_register" BOOLEAN NOT NULL DEFAULT FALSE,
    "default_rank_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "applications_developer_user_id_fkey" FOREIGN KEY ("developer_user_id") REFERENCES "developer_users"("id") ON DELETE CASCADE
);

CREATE INDEX "applications_developer_user_id_idx" ON "applications"("developer_user_id");
CREATE INDEX "applications_status_idx" ON "applications"("status");

CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "key_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "revoked_at" TIMESTAMPTZ,
    "last_used_at" TIMESTAMPTZ,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "api_keys_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX "api_keys_application_id_idx" ON "api_keys"("application_id");

CREATE TABLE "end_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL,
    "last_login_at" TIMESTAMPTZ,

    CONSTRAINT "end_users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "end_users_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "end_users_application_id_email_key" ON "end_users"("application_id", "email");
CREATE INDEX "end_users_application_id_idx" ON "end_users"("application_id");

CREATE TABLE "end_user_refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "end_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "replaced_by_id" UUID,

    CONSTRAINT "end_user_refresh_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "end_user_refresh_tokens_end_user_id_fkey" FOREIGN KEY ("end_user_id") REFERENCES "end_users"("id") ON DELETE CASCADE,
    CONSTRAINT "end_user_refresh_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "end_user_refresh_tokens"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "end_user_refresh_tokens_token_hash_key" ON "end_user_refresh_tokens"("token_hash");
CREATE INDEX "end_user_refresh_tokens_end_user_id_idx" ON "end_user_refresh_tokens"("end_user_id");
CREATE INDEX "end_user_refresh_tokens_expires_at_idx" ON "end_user_refresh_tokens"("expires_at");

CREATE TABLE "ranks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ranks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ranks_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "ranks_application_id_name_key" ON "ranks"("application_id", "name");
CREATE INDEX "ranks_application_id_idx" ON "ranks"("application_id");

CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "permissions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "permissions_application_id_name_key" ON "permissions"("application_id", "name");
CREATE INDEX "permissions_application_id_idx" ON "permissions"("application_id");

CREATE TABLE "rank_permissions" (
    "rank_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "rank_permissions_pkey" PRIMARY KEY ("rank_id", "permission_id"),
    CONSTRAINT "rank_permissions_rank_id_fkey" FOREIGN KEY ("rank_id") REFERENCES "ranks"("id") ON DELETE CASCADE,
    CONSTRAINT "rank_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE
);

CREATE TABLE "licenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "rank_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ,
    "redeemed_at" TIMESTAMPTZ,
    "redeemed_by_id" UUID,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "licenses_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE,
    CONSTRAINT "licenses_rank_id_fkey" FOREIGN KEY ("rank_id") REFERENCES "ranks"("id") ON DELETE RESTRICT,
    CONSTRAINT "licenses_redeemed_by_id_fkey" FOREIGN KEY ("redeemed_by_id") REFERENCES "end_users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "licenses_code_hash_key" ON "licenses"("code_hash");
CREATE INDEX "licenses_application_id_idx" ON "licenses"("application_id");
CREATE INDEX "licenses_status_idx" ON "licenses"("status");

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_type" "ActorType" NOT NULL,
    "actor_id" UUID NOT NULL,
    "app_id" UUID,
    "action" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}'::JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE SET NULL
);

CREATE INDEX "audit_logs_actor_type_actor_id_idx" ON "audit_logs"("actor_type", "actor_id");
CREATE INDEX "audit_logs_app_id_idx" ON "audit_logs"("app_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

ALTER TABLE "applications" ADD CONSTRAINT "applications_default_rank_id_fkey" FOREIGN KEY ("default_rank_id") REFERENCES "ranks"("id") ON DELETE SET NULL;
