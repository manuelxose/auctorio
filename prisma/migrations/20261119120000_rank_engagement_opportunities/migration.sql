ALTER TABLE "engagement_opportunities"
  ADD COLUMN "votes" INTEGER,
  ADD COLUMN "reason" TEXT NOT NULL DEFAULT 'keyword_match',
  ADD COLUMN "score" INTEGER NOT NULL DEFAULT 0 CHECK ("score" BETWEEN 0 AND 100);
