-- AlterTable
ALTER TABLE "end_users" ADD COLUMN     "banned_until" TIMESTAMP(3),
ADD COLUMN     "ban_reason" TEXT,
ADD COLUMN     "banned_at" TIMESTAMP(3);
