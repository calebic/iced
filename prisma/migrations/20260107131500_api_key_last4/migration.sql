ALTER TABLE "api_keys"
  ADD COLUMN "api_key_last4" TEXT;

UPDATE "api_keys"
SET "api_key_last4" = RIGHT("key_hash", 4)
WHERE "api_key_last4" IS NULL;
