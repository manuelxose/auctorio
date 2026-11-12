CREATE TABLE "copilot_threads" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "studio_user_id" UUID NOT NULL,
    "site_id" UUID,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "copilot_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "copilot_messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "competency_key" TEXT,
    "context" JSONB,
    "evidence" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "tokens_input" INTEGER,
    "tokens_output" INTEGER,
    "duration_ms" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "copilot_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "copilot_threads_tenant_id_studio_user_id_updated_at_idx" ON "copilot_threads"("tenant_id", "studio_user_id", "updated_at");
CREATE INDEX "copilot_messages_thread_id_created_at_idx" ON "copilot_messages"("thread_id", "created_at");
CREATE INDEX "copilot_messages_tenant_id_competency_key_created_at_idx" ON "copilot_messages"("tenant_id", "competency_key", "created_at");

ALTER TABLE "copilot_threads" ADD CONSTRAINT "copilot_threads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "copilot_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
