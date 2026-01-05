ALTER TABLE "end_users" ADD COLUMN "rank_id" UUID;

CREATE INDEX "end_users_rank_id_idx" ON "end_users"("rank_id");

ALTER TABLE "end_users" ADD CONSTRAINT "end_users_rank_id_fkey" FOREIGN KEY ("rank_id") REFERENCES "ranks"("id") ON DELETE SET NULL;
