import type {
  ContentImage,
  ContentText,
  Fact,
  Job,
  Tenant,
  Topic,
  FactSourceType,
  ContentTextType,
  LanguageCode,
} from "../entities";

export type TopicCreateInput = {
  title: string;
  description?: string | null;
};

export interface TenantRepository {
  findByApiKeyHash(apiKeyHash: string): Promise<Tenant | null>;
}

export interface TopicRepository {
  create(tenantId: string, input: TopicCreateInput): Promise<Topic>;
  findById(tenantId: string, topicId: string): Promise<Topic | null>;
  findByTitle(tenantId: string, title: string): Promise<Topic | null>;
}

export type FactCreateInput = {
  sourceType: FactSourceType;
  sourceRef?: string | null;
  content: string;
  contentHash: string;
  metadata?: Record<string, unknown> | null;
};

export interface FactRepository {
  create(tenantId: string, topicId: string, input: FactCreateInput): Promise<Fact>;
  findByHash(tenantId: string, topicId: string, contentHash: string): Promise<Fact | null>;
}

export type ContentTextCreateInput = {
  topicId: string;
  type: ContentTextType;
  language: LanguageCode;
  status: "queued" | "processing" | "done" | "failed" | "canceled";
  promptVersion?: string | null;
  dedupeHash?: string | null;
};

export interface ContentTextRepository {
  create(tenantId: string, input: ContentTextCreateInput): Promise<ContentText>;
  findById(tenantId: string, contentTextId: string): Promise<ContentText | null>;
  findByDedupeHash(tenantId: string, dedupeHash: string): Promise<ContentText | null>;
  listByTopic(tenantId: string, topicId: string): Promise<ContentText[]>;
}

export type ContentImageCreateInput = {
  topicId: string;
  textId?: string | null;
  status: "queued" | "processing" | "done" | "failed" | "canceled";
  dedupeHash?: string | null;
};

export interface ContentImageRepository {
  create(tenantId: string, input: ContentImageCreateInput): Promise<ContentImage>;
  findById(tenantId: string, contentImageId: string): Promise<ContentImage | null>;
  findByDedupeHash(tenantId: string, dedupeHash: string): Promise<ContentImage | null>;
  listByTopic(tenantId: string, topicId: string): Promise<ContentImage[]>;
}

export type JobCreateInput = {
  type: "scraping" | "text" | "image";
  status?: "queued" | "processing" | "done" | "failed" | "canceled";
  idempotencyKey?: string | null;
};

export interface JobRepository {
  findByIdempotency(tenantId: string, idempotencyKey: string): Promise<Job | null>;
  create(tenantId: string, input: JobCreateInput): Promise<Job>;
}
