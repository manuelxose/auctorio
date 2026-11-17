// One article lifecycle derived from the records that already exist (plan item,
// production job, website publication). Pure: no state is stored, no migration.

import type { EditorialPlanItemStatus, ProductionJobStatus, PublicationState } from "@prisma/client";

export type ArticleState = "planned" | "drafting" | "needs_review" | "ready" | "scheduled" | "published" | "failed" | "canceled";

/** What the calendar shows. Ready and scheduled are "queued" with a publish time on the card. */
export type ArticleChip = "queued" | "drafting" | "review" | "published" | "failed";

export type ArticleRecords = {
  planItem?: { status: EditorialPlanItemStatus } | null;
  job?: { status: ProductionJobStatus } | null;
  publication?: { status: PublicationState } | null;
};

export function articleState({ planItem, job, publication }: ArticleRecords): ArticleState {
  // Delivery facts win: once something went out (or tried to), that is the state.
  switch (publication?.status) {
    case "published":
      return "published";
    case "failed":
      return "failed";
    case "scheduled":
    case "queued":
    case "publishing":
      return "scheduled";
  }
  // An assisted draft has a `ready` publication waiting for approval: the job decides.
  switch (job?.status) {
    case "queued":
    case "running":
      return "drafting";
    case "needs_review":
      return "needs_review";
    case "failed":
      return "failed";
    case "ready":
      return "ready";
  }
  if (publication?.status === "ready" || publication?.status === "draft") return "ready";
  switch (planItem?.status) {
    case "rejected":
    case "canceled":
      return "canceled";
    case "published":
      return "published";
    case "scheduled":
      return "scheduled";
    case "review_required":
      return "needs_review";
    case "content_pending":
    case "generating":
      return "drafting";
    case "content_ready":
      return "ready";
  }
  // proposed / approved, or a cancelled job whose item went back to approved.
  return "planned";
}

const CHIPS: Record<ArticleState, ArticleChip | null> = {
  planned: "queued",
  ready: "queued",
  scheduled: "queued",
  drafting: "drafting",
  needs_review: "review",
  published: "published",
  failed: "failed",
  canceled: null,
};

export function articleChip(state: ArticleState): ArticleChip | null {
  return CHIPS[state];
}
