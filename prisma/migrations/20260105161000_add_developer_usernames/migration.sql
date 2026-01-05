-- AlterTable
ALTER TABLE "developer_users" ADD COLUMN "username" TEXT;
ALTER TABLE "developer_users" ADD COLUMN "username_normalized" TEXT;

-- Backfill existing rows with email local parts
UPDATE "developer_users"
SET "username" = COALESCE("username", split_part("email", '@', 1)),
    "username_normalized" = LOWER(COALESCE("username", split_part("email", '@', 1)));

-- Enforce required fields
ALTER TABLE "developer_users" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "developer_users" ALTER COLUMN "username_normalized" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "developer_users_username_normalized_key" ON "developer_users"("username_normalized");
