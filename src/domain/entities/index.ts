export type TenantStatus = "active" | "suspended";
export type TopicStatus = "active" | "archived";
export type FactSourceType = "manual" | "rss" | "html" | "api";
export type ContentTextType = "seo" | "instagram";
export type ContentStatus = "queued" | "processing" | "done" | "failed" | "canceled";
export type JobType = "scraping" | "text" | "image";
export type JobStatus = "queued" | "processing" | "done" | "failed" | "canceled";
export type LanguageCode = "es" | "en";

export type Tenant = {
  id: string;
  name: string;
  apiKeyHash: string;
  status: TenantStatus;
  plan?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Topic = {
  id: string;
  tenantId: string;
  title: string;
  description?: string | null;
  status: TopicStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type Fact = {
  id: string;
  tenantId: string;
  topicId: string;
  sourceType: FactSourceType;
  sourceRef?: string | null;
  content: string;
  contentHash: string;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
};

export type ContentText = {
  id: string;
  tenantId: string;
  topicId: string;
  type: ContentTextType;
  language: LanguageCode;
  status: ContentStatus;
  provider?: string | null;
  model?: string | null;
  prompt?: string | null;
  output?: string | null;
  promptVersion?: string | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  costUsd?: number | null;
  error?: string | null;
  dedupeHash?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ContentImage = {
  id: string;
  tenantId: string;
  topicId: string;
  textId?: string | null;
  status: ContentStatus;
  provider?: string | null;
  model?: string | null;
  prompt?: string | null;
  storagePath?: string | null;
  width?: number | null;
  height?: number | null;
  costUsd?: number | null;
  error?: string | null;
  dedupeHash?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Job = {
  id: string;
  tenantId: string;
  type: JobType;
  status: JobStatus;
  idempotencyKey?: string | null;
  attempts: number;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date | null;
  finishedAt?: Date | null;
};

export type AiAudit = {
  id: string;
  tenantId: string;
  jobId: string;
  provider: string;
  model: string;
  prompt: string;
  response?: string | null;
  usageJson?: Record<string, unknown> | null;
  createdAt: Date;
};
