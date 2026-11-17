-- Measured keyword demand (DataForSEO) on plan items.
ALTER TABLE "editorial_plan_items" ADD COLUMN "search_volume" INTEGER;
ALTER TABLE "editorial_plan_items" ADD COLUMN "keyword_difficulty" INTEGER;
ALTER TABLE "editorial_plan_items" ADD COLUMN "keyword_metrics_source" TEXT;
ALTER TABLE "editorial_plan_items" ADD COLUMN "keyword_metrics_at" TIMESTAMP(3);
