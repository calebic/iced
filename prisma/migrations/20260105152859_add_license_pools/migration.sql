-- CreateTable
CREATE TABLE "license_pools" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_pools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "license_pools_application_id_idx" ON "license_pools"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "license_pools_application_id_name_key" ON "license_pools"("application_id", "name");

-- AddForeignKey
ALTER TABLE "license_pools" ADD CONSTRAINT "license_pools_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "licenses" ADD COLUMN     "pool_id" UUID,
ADD COLUMN     "max_uses" INTEGER,
ADD COLUMN     "use_count" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "licenses_pool_id_idx" ON "licenses"("pool_id");

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "license_pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;
