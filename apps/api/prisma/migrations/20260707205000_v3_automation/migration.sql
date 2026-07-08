-- PromoPilot 360 V3 - Automacao multicanal e criativos

ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'FACEBOOK';

CREATE TABLE "creative_assets" (
    "id" TEXT NOT NULL,
    "product_id" TEXT,
    "type" VARCHAR(50) NOT NULL,
    "file_url" TEXT,
    "prompt" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "channel" VARCHAR(60),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "creative_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "publication_schedule" (
    "id" TEXT NOT NULL,
    "product_id" TEXT,
    "offer_id" TEXT,
    "scheduled_post_id" TEXT,
    "creative_asset_id" TEXT,
    "channel" VARCHAR(60) NOT NULL,
    "message" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "status" VARCHAR(40) NOT NULL DEFAULT 'SCHEDULED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "publication_schedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "publication_schedule_scheduled_post_id_key" ON "publication_schedule"("scheduled_post_id");
CREATE INDEX "idx_creative_assets_product" ON "creative_assets"("product_id");
CREATE INDEX "idx_creative_assets_status" ON "creative_assets"("status");
CREATE INDEX "idx_publication_schedule_product" ON "publication_schedule"("product_id");
CREATE INDEX "idx_publication_schedule_offer" ON "publication_schedule"("offer_id");
CREATE INDEX "idx_publication_schedule_channel" ON "publication_schedule"("channel");
CREATE INDEX "idx_publication_schedule_status_time" ON "publication_schedule"("status", "scheduled_at");

ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "publication_schedule" ADD CONSTRAINT "publication_schedule_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "publication_schedule" ADD CONSTRAINT "publication_schedule_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "publication_schedule" ADD CONSTRAINT "publication_schedule_scheduled_post_id_fkey" FOREIGN KEY ("scheduled_post_id") REFERENCES "ScheduledPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "publication_schedule" ADD CONSTRAINT "publication_schedule_creative_asset_id_fkey" FOREIGN KEY ("creative_asset_id") REFERENCES "creative_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
