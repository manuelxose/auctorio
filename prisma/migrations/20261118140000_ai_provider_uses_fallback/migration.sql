-- Per-use text models and an explicit fallback model (Settings → AI).
ALTER TABLE "ai_provider_settings" ADD COLUMN "uses" JSONB;
ALTER TABLE "ai_provider_settings" ADD COLUMN "fallback" JSONB;
