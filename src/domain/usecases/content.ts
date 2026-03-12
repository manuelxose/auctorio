import type { ContentImage, ContentText, Job } from "../entities";
import type { UseCaseDependencies } from "./deps";
import { err, ok, type UseCaseResult } from "./types";
import { RepositoryError } from "../interfaces/errors";
import { sha256 } from "../../shared/utils/hash";

export type GetContentTextInput = {
  tenantId: string;
  contentTextId: string;
};

export type GetContentTextOutput = {
  content: ContentText;
};

export async function getContentTextUseCase(
  deps: UseCaseDependencies,
  input: GetContentTextInput,
): Promise<UseCaseResult<GetContentTextOutput>> {
  const content = await deps.contentTextRepository.findById(input.tenantId, input.contentTextId);
  if (!content) {
    return err("not_found", "content text not found");
  }

  return ok({ content });
}

export type GetContentImageInput = {
  tenantId: string;
  contentImageId: string;
};

export type GetContentImageOutput = {
  content: ContentImage;
};

export async function getContentImageUseCase(
  deps: UseCaseDependencies,
  input: GetContentImageInput,
): Promise<UseCaseResult<GetContentImageOutput>> {
  const content = await deps.contentImageRepository.findById(input.tenantId, input.contentImageId);
  if (!content) {
    return err("not_found", "content image not found");
  }

  return ok({ content });
}

export type GenerateImageFromTextInput = {
  tenantId: string;
  contentTextId: string;
  options?: Record<string, unknown> | null;
  idempotencyKey?: string;
  estimatedCostUsd?: number;
};

export type GenerateImageFromTextOutput = {
  content: ContentImage;
  job: Job | null;
  deduped: boolean;
};

export async function generateImageFromTextUseCase(
  deps: UseCaseDependencies,
  input: GenerateImageFromTextInput,
): Promise<UseCaseResult<GenerateImageFromTextOutput>> {
  const text = await deps.contentTextRepository.findById(input.tenantId, input.contentTextId);
  if (!text) {
    return err("not_found", "content text not found");
  }

  const estimatedCostUsd = input.estimatedCostUsd ?? 0;
  const policy = await deps.costPolicy.check(input.tenantId, estimatedCostUsd);
  if (!policy.allowed) {
    return err("budget_exceeded", policy.reason ?? "budget_exceeded", policy);
  }

  const promptVersion = promptVersionFromOptions(input.options);
  const dedupeHash = sha256(`${input.tenantId}:${text.id}:${promptVersion}`);

  const existing = await deps.contentImageRepository.findByDedupeHash(input.tenantId, dedupeHash);
  if (existing) {
    return ok({ content: existing, job: null, deduped: true });
  }

  let content: ContentImage;
  try {
    content = await deps.contentImageRepository.create(input.tenantId, {
      topicId: text.topicId,
      textId: text.id,
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
    topicId: text.topicId,
    contentImageId: content.id,
    mode: "contextual",
    textId: text.id,
    options: input.options ?? {},
  });

  return ok({ content, job, deduped: false });
}

function promptVersionFromOptions(options?: Record<string, unknown> | null): string {
  if (options && typeof options.prompt_version === "string" && options.prompt_version.trim()) {
    return options.prompt_version.trim();
  }
  return "v1";
}
