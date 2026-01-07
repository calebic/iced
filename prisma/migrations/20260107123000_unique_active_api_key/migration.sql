CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_active_application_id_key"
  ON "api_keys"("application_id")
  WHERE "revoked_at" IS NULL;
