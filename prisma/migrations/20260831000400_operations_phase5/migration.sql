-- Phase 5: Operations hardening — worker heartbeats, cost budgets,
-- AI spend ledger, and scheduler/intelligence index support.
-- No existing data is touched: all statements are additive.

-- Worker liveness heartbeat. One row per worker process name; workers upsert
-- last_beat_at every heartbeat interval and mark themselves stopped on exit.
CREATE TABLE "worker_heartbeats" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "pid" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "current_task" TEXT,
    "started_at" TIMESTAMP(3),
    "last_beat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stopped_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "worker_heartbeats_name_key" ON "worker_heartbeats"("name");
CREATE INDEX "worker_heartbeats_last_beat_at_idx" ON "worker_heartbeats"("last_beat_at");

-- Cost budgets per tenant/site/content-type and period (daily/monthly).
CREATE TABLE "cost_budgets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID,
    "content_type" TEXT,
    "period" TEXT NOT NULL DEFAULT 'daily',
    "limit_usd" DOUBLE PRECISION NOT NULL,
    "hard_limit_usd" DOUBLE PRECISION,
    "action" TEXT NOT NULL DEFAULT 'warn',
    "degrade_model" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_budgets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cost_budgets_tenant_id_site_id_content_type_idx" ON "cost_budgets"("tenant_id", "site_id", "content_type");

ALTER TABLE "cost_budgets" ADD CONSTRAINT "cost_budgets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cost_budgets" ADD CONSTRAINT "cost_budgets_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only AI spend ledger aggregated for budget enforcement.
CREATE TABLE "ai_spend_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID,
    "content_type" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'generation',
    "provider" TEXT,
    "model" TEXT,
    "cost_usd" DOUBLE PRECISION NOT NULL,
    "tokens_input" INTEGER,
    "tokens_output" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_spend_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_spend_events_tenant_id_created_at_idx" ON "ai_spend_events"("tenant_id", "created_at");
CREATE INDEX "ai_spend_events_tenant_id_site_id_created_at_idx" ON "ai_spend_events"("tenant_id", "site_id", "created_at");

ALTER TABLE "ai_spend_events" ADD CONSTRAINT "ai_spend_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_spend_events" ADD CONSTRAINT "ai_spend_events_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Generic indexes for list/cost queries.
CREATE INDEX "publications_tenant_id_created_at_idx" ON "publications"("tenant_id", "created_at");
CREATE INDEX "source_items_tenant_id_intelligence_processed_at_idx" ON "source_items"("tenant_id", "intelligence_processed_at");
CREATE INDEX "operations_tenant_id_status_created_at_idx" ON "operations"("tenant_id", "status", "created_at");

-- Partial indexes for the durable scheduler claim query
-- (SELECT ... WHERE status IN ('scheduled','failed') AND due ... FOR UPDATE SKIP LOCKED).
CREATE INDEX "publications_due_scheduled_for_idx" ON "publications"("scheduled_for") WHERE status = 'scheduled';
CREATE INDEX "publications_due_next_retry_at_idx" ON "publications"("next_retry_at") WHERE status = 'failed';

-- Partial index for the intelligence backfill scan
-- (processing_status IN (...) AND intelligence_processed_at IS NULL).
CREATE INDEX "source_items_pending_intelligence_idx" ON "source_items"("tenant_id", "discovered_at") WHERE "intelligence_processed_at" IS NULL;
