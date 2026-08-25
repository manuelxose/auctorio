import { completeOperation, failOperation, classifyRetryable } from "../../studio/operations";
import { structuredEvent } from "../../shared/utils/logger";

type JobDataWithOperation = { operationId?: string };

/**
 * Update the durable operation correlated with a worker job. Reads the
 * `operationId` that the enqueue sites embed in the job payload.
 */
export async function completeOperationForJob(data: unknown): Promise<void> {
  const operationId = (data as JobDataWithOperation)?.operationId;
  if (!operationId) {
    return;
  }
  try {
    await completeOperation(operationId);
  } catch (error) {
    structuredEvent("operation.worker_complete_failed", { operationId, error: error instanceof Error ? error.message : String(error) }, "warn");
  }
}

export async function failOperationForJob(data: unknown, error: Error | string): Promise<void> {
  const operationId = (data as JobDataWithOperation)?.operationId;
  if (!operationId) {
    return;
  }
  const message = typeof error === "string" ? error : error.message;
  const classified = classifyRetryable(message);
  try {
    await failOperation(operationId, {
      errorCode: classified.code,
      errorSummary: message,
      retryable: classified.retryable,
    });
  } catch (failure) {
    structuredEvent("operation.worker_fail_failed", { operationId, error: failure instanceof Error ? failure.message : String(failure) }, "warn");
  }
}

export async function markOperationStartedForJob(data: unknown, phase?: string): Promise<void> {
  const operationId = (data as JobDataWithOperation)?.operationId;
  if (!operationId) {
    return;
  }
  try {
    const { startOperation } = await import("../../studio/operations");
    await startOperation(operationId, phase);
  } catch {
    /* ignore */
  }
}
