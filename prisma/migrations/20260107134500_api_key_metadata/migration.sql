ALTER TABLE "api_keys"
  ADD COLUMN "api_key_created_at" TIMESTAMP(3),
  ADD COLUMN "api_key_last_used_at" TIMESTAMP(3);

UPDATE "api_keys"
SET "api_key_created_at" = "created_at"
WHERE "api_key_created_at" IS NULL;

UPDATE "api_keys"
SET "api_key_last_used_at" = "last_used_at"
WHERE "api_key_last_used_at" IS NULL;
