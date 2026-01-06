-- CreateEnum
CREATE TYPE "RegistrationFieldPolicy" AS ENUM ('required', 'optional', 'disabled');

-- AlterTable
ALTER TABLE "applications"
  ADD COLUMN "email_policy" "RegistrationFieldPolicy" NOT NULL DEFAULT 'required',
  ADD COLUMN "license_policy" "RegistrationFieldPolicy" NOT NULL DEFAULT 'optional';

UPDATE "applications"
SET "license_policy" = CASE
  WHEN "license_required_on_register" = TRUE THEN 'required'
  ELSE 'optional'
END;

ALTER TABLE "applications" DROP COLUMN "license_required_on_register";

-- AlterTable
ALTER TABLE "end_users"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "username_normalized" TEXT,
  ADD COLUMN "rank_expires_at" TIMESTAMP(3),
  ADD COLUMN "rank_source_license_id" UUID;

UPDATE "end_users"
SET "username" = "email"
WHERE "username" IS NULL;

UPDATE "end_users"
SET "username_normalized" = LOWER(TRIM("username"))
WHERE "username_normalized" IS NULL;

ALTER TABLE "end_users" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "end_users" ALTER COLUMN "username_normalized" SET NOT NULL;
ALTER TABLE "end_users" ALTER COLUMN "email" DROP NOT NULL;

CREATE UNIQUE INDEX "end_users_application_id_username_normalized_key"
  ON "end_users"("application_id", "username_normalized");

ALTER TABLE "end_users"
  ADD CONSTRAINT "end_users_rank_source_license_id_fkey"
  FOREIGN KEY ("rank_source_license_id")
  REFERENCES "licenses"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "licenses"
  ADD COLUMN "duration_seconds" INTEGER;
