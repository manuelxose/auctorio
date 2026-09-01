// Source adapter contract. Adapters are stateless, provider-specific behavior
// lives in adapter configuration (ContentSource.configuration), and business
// services never hardcode publisher names.

import type { ContentSource, ContentSourceType } from "@prisma/client";

export type SourceAdapterType = ContentSourceType;

/** Limits applied to a single discovery call. */
export type DiscoveryLimits = {
  maxItems?: number;
};

/** Resolved operational policies for one discovery call. */
export type AdapterPolicies = {
  timeoutMs: number;
  /** Total attempts including the first. */
  retryAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  respectRobots: boolean;
  rateLimit: { maxRequestsPerMinute: number; minIntervalMs: number } | null;
  userAgent: string;
  maxItems: number;
};

/**
 * HTTP observation recorded by adapters during discovery. The business layer
 * persists these (conditional-request state, last status) on the source so the
 * next fetch can send If-None-Match / If-Modified-Since.
 */
export type SourceHttpObservation = {
  etag?: string | null;
  lastModified?: string | null;
  status?: number | null;
  notModified?: boolean;
  finalUrl?: string | null;
  rateLimited?: boolean;
  retryAfterSeconds?: number | null;
};

/** Context passed to every adapter call; carries run tracing and policies. */
export type DiscoveryContext = {
  runId: string;
  tenantId?: string;
  now?: Date;
  signal?: AbortSignal;
  limits: DiscoveryLimits;
  policies?: Partial<AdapterPolicies>;
  /** Adapters fill this in; fetchSourceNow persists it after discovery. */
  observed?: SourceHttpObservation;
};

export type FetchContext = DiscoveryContext;

/**
 * Normalized discovery record. Raw source payloads stay at the source boundary:
 * `rawMetadata` holds bounded metadata only (IDs, feeds, timestamps) — full
 * bodies live in `rawText` and are cleaned before any business use.
 */
export type DiscoveredSourceItem = {
  externalId: string;
  canonicalUrl: string | null;
  sourceUrl: string | null;
  title: string;
  description: string | null;
  rawText: string | null;
  cleanedText: string | null;
  author: string | null;
  authors: string[];
  publishedAt: string | null;
  modifiedAt: string | null;
  sourceImageUrls: string[];
  language: string | null;
  categories: string[];
  tags: string[];
  /** Bounded structured metadata from the raw payload. */
  rawMetadata: Record<string, unknown> | null;
  /** Attribution (original author, syndication source, license…) — JSON column. */
  attribution: Record<string, unknown> | null;
  /** Adapter extraction confidence 0..1. */
  confidence: number | null;
};

/** Full-document result of a `fetchDetails` enrichment call. */
export type SourceDocument = {
  url: string;
  title: string | null;
  /** Deck / subtitle / meta description. */
  description: string | null;
  html: string | null;
  text: string | null;
  author: string | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  language: string | null;
  imageUrls: string[];
  /** Article section (schema.org articleSection / breadcrumbs). */
  section: string | null;
  categories: string[];
  tags: string[];
  rawMetadata: Record<string, unknown> | null;
  confidence: number | null;
};

/** Result of an adapter `healthCheck` call. */
export type SourceHealthCheck = {
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  itemCount: number | null;
  error: string | null;
};

/** Minimal source view adapters are allowed to depend on. */
export type SourceRef = Pick<
  ContentSource,
  | "id"
  | "type"
  | "url"
  | "endpoint"
  | "configuration"
  | "rateLimitPolicy"
  | "robotsPolicy"
  | "extractionPolicy"
  | "timezone"
  | "language"
  | "domain"
  | "lastEtag"
  | "lastModifiedHeader"
>;

export interface SourceAdapter {
  readonly type: SourceAdapterType;

  /**
   * Discover items from the source (feed, listing, sitemap, API page…).
   * Must be stateless and respect context limits/policies.
   */
  discover(source: SourceRef, context: DiscoveryContext): Promise<DiscoveredSourceItem[]>;

  /**
   * Optional enrichment: fetch the full document behind a discovered item
   * (article HTML, API detail endpoint…).
   */
  fetchDetails?(item: DiscoveredSourceItem, context: FetchContext): Promise<SourceDocument>;

  /** Optional lightweight liveness/contract check for health tracking. */
  healthCheck?(source: SourceRef, context: DiscoveryContext): Promise<SourceHealthCheck>;
}
