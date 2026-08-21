-- Publication idempotency: stable identity around site+project+version+action
ALTER TABLE "publication_jobs" ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "publication_jobs_tenant_id_idempotency_key_key" ON "publication_jobs"("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
