-- PromoPilot 360 V4 - AI, analytics e autonomia

CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "agent_name" VARCHAR(120) NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "status" VARCHAR(40) NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "tokens_input" INTEGER,
    "tokens_output" INTEGER,
    "estimated_cost" DECIMAL(12,6),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_recommendations" (
    "id" TEXT NOT NULL,
    "product_id" TEXT,
    "recommendation_type" VARCHAR(80),
    "title" TEXT,
    "description" TEXT,
    "priority" VARCHAR(40),
    "confidence" DECIMAL(5,2),
    "agent_name" VARCHAR(120),
    "status" VARCHAR(40) NOT NULL DEFAULT 'pending',
    "accepted_by" TEXT,
    "accepted_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_metrics" (
    "id" TEXT NOT NULL,
    "product_id" TEXT,
    "publication_id" TEXT,
    "channel" VARCHAR(80),
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commission" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ctr" DECIMAL(8,4),
    "conversion_rate" DECIMAL(8,4),
    "date_reference" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "performance_metrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ml_predictions" (
    "id" TEXT NOT NULL,
    "product_id" TEXT,
    "model_name" VARCHAR(120),
    "prediction_type" VARCHAR(80),
    "prediction_value" DECIMAL(12,6),
    "confidence" DECIMAL(5,2),
    "features" JSONB,
    "explanation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ml_predictions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vector_documents" (
    "id" TEXT NOT NULL,
    "entity_type" VARCHAR(80),
    "entity_id" TEXT,
    "content" TEXT,
    "metadata" JSONB,
    "embedding" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vector_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_cost_control" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(80),
    "model" VARCHAR(120),
    "operation" VARCHAR(120),
    "tokens_input" INTEGER,
    "tokens_output" INTEGER,
    "estimated_cost" DECIMAL(12,6),
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_cost_control_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "autonomy_policies" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL DEFAULT 'default',
    "mode" VARCHAR(40) NOT NULL DEFAULT 'manual',
    "daily_publication_limit" INTEGER NOT NULL DEFAULT 10,
    "allowed_channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "min_score" DECIMAL(5,2) NOT NULL DEFAULT 75,
    "min_commission" DECIMAL(12,2),
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "require_coupon" BOOLEAN NOT NULL DEFAULT false,
    "daily_ai_cost_limit" DECIMAL(12,2) NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "autonomy_policies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_agent_runs_agent" ON "agent_runs"("agent_name");
CREATE INDEX "idx_agent_runs_status" ON "agent_runs"("status");
CREATE INDEX "idx_agent_runs_created" ON "agent_runs"("created_at");
CREATE INDEX "idx_ai_recommendations_product" ON "ai_recommendations"("product_id");
CREATE INDEX "idx_ai_recommendations_type" ON "ai_recommendations"("recommendation_type");
CREATE INDEX "idx_ai_recommendations_status" ON "ai_recommendations"("status");
CREATE INDEX "idx_performance_product" ON "performance_metrics"("product_id");
CREATE INDEX "idx_performance_channel" ON "performance_metrics"("channel");
CREATE INDEX "idx_performance_date" ON "performance_metrics"("date_reference");
CREATE INDEX "idx_ml_predictions_product" ON "ml_predictions"("product_id");
CREATE INDEX "idx_ml_predictions_model" ON "ml_predictions"("model_name");
CREATE INDEX "idx_ml_predictions_type" ON "ml_predictions"("prediction_type");
CREATE INDEX "idx_vector_documents_entity" ON "vector_documents"("entity_type", "entity_id");
CREATE INDEX "idx_ai_cost_control_user" ON "ai_cost_control"("user_id");
CREATE INDEX "idx_ai_cost_control_created" ON "ai_cost_control"("created_at");
CREATE INDEX "idx_autonomy_policy_active" ON "autonomy_policies"("active");

ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publication_schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ml_predictions" ADD CONSTRAINT "ml_predictions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_cost_control" ADD CONSTRAINT "ai_cost_control_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "autonomy_policies" ("id", "name", "mode", "daily_publication_limit", "allowed_channels", "min_score", "daily_ai_cost_limit", "active", "updated_at")
VALUES ('default-autonomy-policy', 'Default', 'manual', 10, ARRAY['TELEGRAM','INSTAGRAM','FACEBOOK'], 75, 5, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
