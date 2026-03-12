import type { ContentImage, ContentText, Fact, Job, Topic } from "../entities";
import type { UseCaseDependencies } from "./deps";
import { err, ok, type UseCaseResult } from "./types";
import { RepositoryError } from "../interfaces/errors";
import { normalizeText } from "../../shared/utils/text";
import { sha256 } from "../../shared/utils/hash";

export type CreateTopicInput = {
  tenantId: string;
  title?: string;
  description?: string | null;
};

export type CreateTopicOutput = {
  topic: Topic;
};

export async function createTopicUseCase(
  deps: UseCaseDependencies,
  input: CreateTopicInput,
): Promise<UseCaseResult<CreateTopicOutput>> {
  const title = input.title?.trim();
  if (!title) {
    return err("bad_request", "title is required");
  }

  const existing = await deps.topicRepository.findByTitle(input.tenantId, title);
  if (existing) {
    return err("conflict", "topic already exists");
  }

  try {
    const topic = await deps.topicRepository.create(input.tenantId, {
      title,
      description: input.description ?? null,
    });
    return ok({ topic });
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "conflict") {
      return err("conflict", "topic already exists");
    }
    throw error;
  }
}

export type AddFactInput = {
  tenantId: string;
  topicId: string;
  sourceType?: "manual" | "rss" | "html" | "api";
  sourceRef?: string;
  content?: string;
  metadata?: Record<string, unknown> | null;
  idempotencyKey?: string;
};

export type AddFactOutput =
  | { kind: "manual"; fact: Fact; created: boolean }
  | { kind: "scraping_job"; job: Job };

export async function addFactUseCase(
  deps: UseCaseDependencies,
  input: AddFactInput,
): Promise<UseCaseResult<AddFactOutput>> {
  if (!input.sourceType) {
    return err("bad_request", "source_type is required");
  }

  const allowedSourceTypes = new Set(["manual", "rss", "html", "api"]);
  if (!allowedSourceTypes.has(input.sourceType)) {
    return err("bad_request", "invalid source_type");
  }

  const topic = await deps.topicRepository.findById(input.tenantId, input.topicId);
  if (!topic) {
    return err("not_found", "topic not found");
  }

  if (input.sourceType === "manual") {
    if (!input.content?.trim()) {
      return err("bad_request", "content is required for manual facts");
    }

    const contentHash = sha256(normalizeText(input.content));
    const existing = await deps.factRepository.findByHash(input.tenantId, input.topicId, contentHash);
    if (existing) {
      return ok({ kind: "manual", fact: existing, created: false });
    }

    try {
      const fact = await deps.factRepository.create(input.tenantId, input.topicId, {
        sourceType: "manual",
        sourceRef: input.sourceRef ?? null,
        content: input.content,
        contentHash,
        metadata: input.metadata ?? null,
      });
      return ok({ kind: "manual", fact, created: true });
    } catch (error) {
      if (error instanceof RepositoryError && error.code === "conflict") {
        const duplicate = await deps.factRepository.findByHash(input.tenantId, input.topicId, contentHash);
        if (duplicate) {
          return ok({ kind: "manual", fact: duplicate, created: false });
        }
      }
      throw error;
    }
  }

  if (!input.sourceRef) {
    return err("bad_request", "source_ref is required for scraping");
  }

  if (input.idempotencyKey) {
    const existingJob = await deps.jobRepository.findByIdempotency(input.tenantId, input.idempotencyKey);
    if (existingJob) {
      return ok({ kind: "scraping_job", job: existingJob });
    }
  }

  const job = await deps.jobRepository.create(input.tenantId, {
    type: "scraping",
    idempotencyKey: input.idempotencyKey ?? null,
  });

  await deps.queue.enqueueScrapingJob(job.id, {
    jobId: job.id,
    tenantId: input.tenantId,
    topicId: input.topicId,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    metadata: input.metadata ?? null,
  });

  return ok({ kind: "scraping_job", job });
}

export type GenerateTextInput = {
  tenantId: string;
  topicId: string;
  type?: "seo" | "instagram";
  language?: "es" | "en";
  options?: Record<string, unknown> | null;
  idempotencyKey?: string;
  estimatedCostUsd?: number;
};

export type GenerateTextOutput = {
  content: ContentText;
  job: Job | null;
  deduped: boolean;
};

export async function generateTextUseCase(
  deps: UseCaseDependencies,
  input: GenerateTextInput,
): Promise<UseCaseResult<GenerateTextOutput>> {
  if (!input.type || !input.language) {
    return err("bad_request", "type and language are required");
  }

  const allowedTypes = new Set(["seo", "instagram"]);
  const allowedLanguages = new Set(["es", "en"]);
  if (!allowedTypes.has(input.type) || !allowedLanguages.has(input.language)) {
    return err("bad_request", "invalid type or language");
  }

  const topic = await deps.topicRepository.findById(input.tenantId, input.topicId);
  if (!topic) {
    return err("not_found", "topic not found");
  }

  const estimatedCostUsd = input.estimatedCostUsd ?? 0;
  const policy = await deps.costPolicy.check(input.tenantId, estimatedCostUsd);
  if (!policy.allowed) {
    return err("budget_exceeded", policy.reason ?? "budget_exceeded", policy);
  }

  const promptVersion = promptVersionFromOptions(input.options);
  const dedupeHash = sha256(`${input.tenantId}:${input.topicId}:${input.type}:${input.language}:${promptVersion}`);

  const existing = await deps.contentTextRepository.findByDedupeHash(input.tenantId, dedupeHash);
  if (existing) {
    return ok({ content: existing, job: null, deduped: true });
  }

  let content: ContentText;
  try {
    content = await deps.contentTextRepository.create(input.tenantId, {
      topicId: input.topicId,
      type: input.type,
      language: input.language,
      status: "queued",
      promptVersion,
      dedupeHash,
    });
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "conflict") {
      const duplicate = await deps.contentTextRepository.findByDedupeHash(input.tenantId, dedupeHash);
      if (duplicate) {
        return ok({ content: duplicate, job: null, deduped: true });
      }
    }
    throw error;
  }

  let job: Job | null = null;
  try {
    job = await deps.jobRepository.create(input.tenantId, {
      type: "text",
      idempotencyKey: input.idempotencyKey ?? null,
    });
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "conflict") {
      return err("conflict", "idempotency_key_already_used");
    }
    throw error;
  }

  await deps.queue.enqueueTextJob(job.id, {
    jobId: job.id,
    tenantId: input.tenantId,
    topicId: input.topicId,
    contentTextId: content.id,
    type: input.type,
    language: input.language,
    options: input.options ?? {},
  });

  return ok({ content, job, deduped: false });
}

export type GenerateImageInput = {
  tenantId: string;
  topicId: string;
  mode?: "contextual" | "independent";
  options?: Record<string, unknown> | null;
  idempotencyKey?: string;
  estimatedCostUsd?: number;
};

export type GenerateImageOutput = {
  content: ContentImage;
  job: Job | null;
  deduped: boolean;
};

export async function generateImageUseCase(
  deps: UseCaseDependencies,
  input: GenerateImageInput,
): Promise<UseCaseResult<GenerateImageOutput>> {
  const mode = input.mode ?? "independent";
  const allowedModes = new Set(["contextual", "independent"]);
  if (!allowedModes.has(mode)) {
    return err("bad_request", "invalid mode");
  }

  const topic = await deps.topicRepository.findById(input.tenantId, input.topicId);
  if (!topic) {
    return err("not_found", "topic not found");
  }

  const estimatedCostUsd = input.estimatedCostUsd ?? 0;
  const policy = await deps.costPolicy.check(input.tenantId, estimatedCostUsd);
  if (!policy.allowed) {
    return err("budget_exceeded", policy.reason ?? "budget_exceeded", policy);
  }

  const promptVersion = promptVersionFromOptions(input.options);
  const dedupeHash = sha256(`${input.tenantId}:${input.topicId}:${mode}:${promptVersion}`);

  const existing = await deps.contentImageRepository.findByDedupeHash(input.tenantId, dedupeHash);
  if (existing) {
    return ok({ content: existing, job: null, deduped: true });
  }

  let content: ContentImage;
  try {
    content = await deps.contentImageRepository.create(input.tenantId, {
      topicId: input.topicId,
      status: "queued",
      dedupeHash,
    });
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "conflict") {
      const duplicate = await deps.contentImageRepository.findByDedupeHash(input.tenantId, dedupeHash);
      if (duplicate) {
        return ok({ content: duplicate, job: null, deduped: true });
      }
    }
    throw error;
  }

  let job: Job | null = null;
  try {
    job = await deps.jobRepository.create(input.tenantId, {
      type: "image",
      idempotencyKey: input.idempotencyKey ?? null,
    });
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "conflict") {
      return err("conflict", "idempotency_key_already_used");
    }
    throw error;
  }

  await deps.queue.enqueueImageJob(job.id, {
    jobId: job.id,
    tenantId: input.tenantId,
    topicId: input.topicId,
    contentImageId: content.id,
    mode,
    options: input.options ?? {},
  });

  return ok({ content, job, deduped: false });
}

export type GetResultsInput = {
  tenantId: string;
  topicId: string;
};

export type GetResultsOutput = {
  topic: Topic;
  texts: ContentText[];
  images: ContentImage[];
};

export async function getResultsUseCase(
  deps: UseCaseDependencies,
  input: GetResultsInput,
): Promise<UseCaseResult<GetResultsOutput>> {
  const topic = await deps.topicRepository.findById(input.tenantId, input.topicId);
  if (!topic) {
    return err("not_found", "topic not found");
  }

  const [texts, images] = await Promise.all([
    deps.contentTextRepository.listByTopic(input.tenantId, input.topicId),
    deps.contentImageRepository.listByTopic(input.tenantId, input.topicId),
  ]);

  return ok({ topic, texts, images });
}

function promptVersionFromOptions(options?: Record<string, unknown> | null): string {
  if (options && typeof options.prompt_version === "string" && options.prompt_version.trim()) {
    return options.prompt_version.trim();
  }
  return "v1";
}
