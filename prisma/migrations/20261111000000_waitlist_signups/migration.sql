-- Public website waitlist: one row per email, refreshed on re-submission.
CREATE TABLE "waitlist_signups" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "company" TEXT,
  "message" TEXT,
  "locale" TEXT NOT NULL DEFAULT 'en',
  "source_path" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "waitlist_signups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "waitlist_signups_email_key" ON "waitlist_signups"("email");
