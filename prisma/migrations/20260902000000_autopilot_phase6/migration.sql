-- Autopilot (Phase 6): explicit automation modes, self-healing QA repair,
-- strict autonomous quality gate, execution substates and circuit breakers.
-- Backwards compatible: every new column has a safe default.

-- ── automation_policies ─────────────────────────────────────────────
ALTER TABLE "automation_policies"
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "auto_repair" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "max_repair_attempts" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "autonomous_qa_thresholds" JSONB,
  ADD COLUMN "source_requirements" JSONB,
  ADD COLUMN "consecutive_publish_failures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "circuit_open" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "circuit_opened_at" TIMESTAMPTZ;

-- ── content_projects: automation mode + fine-grained execution substate ──
ALTER TABLE "content_projects"
  ADD COLUMN "automation_mode" TEXT,
  ADD COLUMN "automation_substate" TEXT;

CREATE INDEX "content_projects_tenant_id_automation_substate_idx"
  ON "content_projects" ("tenant_id", "automation_substate");

-- ── content_versions: repair bookkeeping + autonomous gate result ──────
ALTER TABLE "content_versions"
  ADD COLUMN "repair_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "repair_locked_until" TIMESTAMPTZ,
  ADD COLUMN "autonomous_gate_passed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autonomous_gate_report" JSONB;

CREATE INDEX "content_versions_repair_lock_idx"
  ON "content_versions" ("repair_locked_until");

-- ── quality_repair_attempts: durable audit of every targeted repair ────
CREATE TABLE "quality_repair_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "findings_snapshot" JSONB,
  "strategies" JSONB,
  "changed_fields" JSONB,
  "qa_score_before" DOUBLE PRECISION,
  "qa_score_after" DOUBLE PRECISION,
  "remaining_blockers" JSONB,
  "provider" TEXT,
  "model" TEXT,
  "cost_usd" DOUBLE PRECISION,
  "error" TEXT,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "finished_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "quality_repair_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quality_repair_attempts_tenant_version_idx"
  ON "quality_repair_attempts" ("tenant_id", "version_id", "attempt_number");

ALTER TABLE "quality_repair_attempts" ADD CONSTRAINT "quality_repair_attempts_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "content_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_repair_attempts" ADD CONSTRAINT "quality_repair_attempts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_repair_attempts" ADD CONSTRAINT "quality_repair_attempts_version_id_fkey"
  FOREIGN KEY ("version_id") REFERENCES "content_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
