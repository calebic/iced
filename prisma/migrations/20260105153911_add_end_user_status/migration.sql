-- CreateEnum
CREATE TYPE "EndUserStatus" AS ENUM ('active', 'disabled');

-- AlterTable
ALTER TABLE "end_users" ADD COLUMN     "status" "EndUserStatus" NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE INDEX "end_users_status_idx" ON "end_users"("status");
