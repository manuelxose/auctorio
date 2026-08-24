-- Enterprise editorial planning: plan items become full SEO briefs.
-- Additive only. No drops, no destructive changes.

ALTER TABLE "editorial_plan_items" ADD COLUMN "content_type" TEXT;
ALTER TABLE "editorial_plan_items" ADD COLUMN "primary_intent" TEXT;
ALTER TABLE "editorial_plan_items" ADD COLUMN "secondary_intents" JSONB;
ALTER TABLE "editorial_plan_items" ADD COLUMN "funnel_stage" TEXT;
ALTER TABLE "editorial_plan_items" ADD COLUMN "target_query" TEXT;
ALTER TABLE "editorial_plan_items" ADD COLUMN "semantic_keywords" JSONB;
ALTER TABLE "editorial_plan_items" ADD COLUMN "questions_to_answer" JSONB;
ALTER TABLE "editorial_plan_items" ADD COLUMN "topic_cluster" TEXT;
ALTER TABLE "editorial_plan_items" ADD COLUMN "pillar_page" TEXT;
ALTER TABLE "editorial_plan_items" ADD COLUMN "final_suggested_title" TEXT;
ALTER TABLE "editorial_plan_items" ADD COLUMN "angle" TEXT;
ALTER TABLE "editorial_plan_items" ADD COLUMN "editorial_objective" TEXT;
ALTER TABLE "editorial_plan_items" ADD COLUMN "competitor_angle" TEXT;
ALTER TABLE "editorial_plan_items" ADD COLUMN "suggested_internal_links" JSONB;
ALTER TABLE "editorial_plan_items" ADD COLUMN "suggested_external_evidence_types" JSONB;
ALTER TABLE "editorial_plan_items" ADD COLUMN "faq_candidates" JSONB;
ALTER TABLE "editorial_plan_items" ADD COLUMN "schema_types" JSONB;
ALTER TABLE "editorial_plan_items" ADD COLUMN "outline" JSONB;
ALTER TABLE "editorial_plan_items" ADD COLUMN "recommended_word_count_min" INTEGER;
ALTER TABLE "editorial_plan_items" ADD COLUMN "recommended_word_count_max" INTEGER;
ALTER TABLE "editorial_plan_items" ADD COLUMN "difficulty_estimate" INTEGER;
ALTER TABLE "editorial_plan_items" ADD COLUMN "opportunity_score" DOUBLE PRECISION;
ALTER TABLE "editorial_plan_items" ADD COLUMN "relevance_score" DOUBLE PRECISION;
ALTER TABLE "editorial_plan_items" ADD COLUMN "cannibalization_risk" TEXT;
ALTER TABLE "editorial_plan_items" ADD COLUMN "confidence" DOUBLE PRECISION;
ALTER TABLE "editorial_plan_items" ADD COLUMN "rationale" TEXT;
ALTER TABLE "editorial_plan_items" ADD COLUMN "source_evidence" JSONB;
ALTER TABLE "editorial_plan_items" ADD COLUMN "freshness_requirement" TEXT;

ALTER TABLE "editorial_plans" ADD COLUMN "strategy_mode" TEXT;
ALTER TABLE "editorial_plans" ADD COLUMN "primary_intent" TEXT;
ALTER TABLE "editorial_plans" ADD COLUMN "content_formats" JSONB;
ALTER TABLE "editorial_plans" ADD COLUMN "topic_strategy" JSONB;
ALTER TABLE "editorial_plans" ADD COLUMN "relevance_threshold" DOUBLE PRECISION;
ALTER TABLE "editorial_plans" ADD COLUMN "site_intelligence_version" INTEGER;

CREATE INDEX "editorial_plan_items_tenant_id_site_id_target_query_idx" ON "editorial_plan_items"("tenant_id", "site_id", "target_query");
CREATE INDEX "editorial_plan_items_tenant_id_relevance_score_idx" ON "editorial_plan_items"("tenant_id", "relevance_score");
