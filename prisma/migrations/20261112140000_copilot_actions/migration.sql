-- CreateTable
CREATE TABLE "copilot_actions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "studio_user_id" UUID NOT NULL,
    "thread_id" UUID,
    "message_id" UUID,
    "tool" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" JSONB,
    "error" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copilot_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "copilot_actions_tenant_id_studio_user_id_status_created_at_idx" ON "copilot_actions"("tenant_id", "studio_user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "copilot_actions_message_id_idx" ON "copilot_actions"("message_id");

-- AddForeignKey
ALTER TABLE "copilot_actions" ADD CONSTRAINT "copilot_actions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_actions" ADD CONSTRAINT "copilot_actions_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "copilot_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_actions" ADD CONSTRAINT "copilot_actions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "copilot_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

