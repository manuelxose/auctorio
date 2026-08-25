import { Worker } from "bullmq";
import { getPrismaClient } from "../db/prisma";
import { QUEUE_NAMES } from "../queue/queues";
import { getRedisConnectionOptions } from "../queue/redis";
import { discoverWebsite } from "../../studio/connectors/discovery";
import { verifyWebsiteConnector } from "../../studio/connectors/verification";
import {
  getInstallation,
  resolveInstallationSecrets,
  transitionInstallation,
} from "../../studio/connectors/installation";
import { failOperation, startOperation, touchOperationProgress } from "../../studio/operations";
import { notify } from "../../studio/notifications";
import { publishEvent } from "../../studio/events";
import { structuredEvent } from "../../shared/utils/logger";
import { getNumberEnv } from "../../shared/utils/env";

const prisma = getPrismaClient();

type ConnectionJobData =
  | { kind: "discover"; installationId: string; tenantId: string; operationId: string; siteId: string | null }
  | { kind: "verify"; installationId: string; tenantId: string; operationId: string; siteId: string | null };

type ConnectionDependencies = {
  discoverWebsite: typeof discoverWebsite;
  verifyWebsiteConnector: typeof verifyWebsiteConnector;
};

const defaultDependencies: ConnectionDependencies = {
  discoverWebsite,
  verifyWebsiteConnector,
};

async function runDiscovery(data: Extract<ConnectionJobData, { kind: "discover" }>, dependencies: ConnectionDependencies) {
  const installation = await getInstallation(data.tenantId, data.installationId);
  if (!installation) {
    throw new Error("installation_not_found");
  }
  await startOperation(data.operationId, "discovering");
  await touchOperationProgress(data.operationId, { phase: "discovering", progress: 20 });
  try {
    const rawUrl = String(((installation.config ?? {}) as Record<string, unknown>).baseUrl ?? ((installation.discovered ?? {}) as Record<string, unknown>).inputUrl ?? "");
    if (!rawUrl) {
      throw new Error("discovery_url_missing");
    }
    const result = await dependencies.discoverWebsite(rawUrl);
    await touchOperationProgress(data.operationId, { phase: "discovering", progress: 80 });
    await prisma.connectorInstallation.update({
      where: { id: installation.id },
      data: {
        discovered: result as unknown as never,
        capabilities: {
          supported: result.publishingCapabilities,
          cms: result.cms,
        } as unknown as never,
        displayName: installation.displayName ?? result.title,
      },
    });
    await transitionInstallation(data.tenantId, installation.id, "credentials_required", {
      patch: {
        discovered: result as unknown as Record<string, unknown>,
        capabilities: { supported: result.publishingCapabilities, cms: result.cms },
      },
    });
    await publishEvent({
      tenantId: data.tenantId,
      siteId: data.siteId,
      type: "connection.installation.state",
      payload: { installationId: installation.id, state: "credentials_required", reachable: result.reachable },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await transitionInstallation(data.tenantId, installation.id, "failed", { error: message });
    await failOperation(data.operationId, { errorCode: "discovery_failed", errorSummary: message, retryable: true });
    throw error;
  }
}

async function runVerification(data: Extract<ConnectionJobData, { kind: "verify" }>, dependencies: ConnectionDependencies) {
  const installation = await getInstallation(data.tenantId, data.installationId);
  if (!installation) {
    throw new Error("installation_not_found");
  }
  await startOperation(data.operationId, "verifying");
  await touchOperationProgress(data.operationId, { phase: "verifying", progress: 20 });
  try {
    const mergedConfig = await resolveInstallationSecrets(installation);
    const result = await dependencies.verifyWebsiteConnector(
      installation.provider,
      mergedConfig,
    );
    await touchOperationProgress(data.operationId, { phase: "verifying", progress: 80 });
    if (result.verified) {
      await transitionInstallation(data.tenantId, installation.id, "ready", {
        patch: { verifiedAt: new Date() },
      });
      await publishEvent({
        tenantId: data.tenantId,
        siteId: data.siteId,
        type: "connection.installation.state",
        payload: { installationId: installation.id, state: "ready" },
      });
      await notify({
        tenantId: data.tenantId,
        siteId: data.siteId,
        category: "connection",
        severity: "success",
        title: "Destination verified",
        message: `${installation.displayName ?? "The destination"} passed its capability probes and is ready to activate.`,
        entityType: "connector_installation",
        entityId: installation.id,
        actionUrl: "/studio/connections?installation=" + installation.id,
        dedupeKey: `installation.${installation.id}.ready`,
      });
    } else {
      await transitionInstallation(data.tenantId, installation.id, "failed", { error: result.summary });
      await failOperation(data.operationId, { errorCode: "verification_failed", errorSummary: result.summary, retryable: false });
      await notify({
        tenantId: data.tenantId,
        siteId: data.siteId,
        category: "connection",
        severity: "error",
        title: "Destination verification failed",
        message: result.summary,
        entityType: "connector_installation",
        entityId: installation.id,
        actionUrl: "/studio/connections?installation=" + installation.id,
        dedupeKey: `installation.${installation.id}.failed`,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await transitionInstallation(data.tenantId, installation.id, "failed", { error: message });
    await failOperation(data.operationId, { errorCode: "verification_error", errorSummary: message, retryable: true });
    throw error;
  }
}

export async function processConnectionJob(data: ConnectionJobData, dependencies: ConnectionDependencies = defaultDependencies): Promise<void> {
  structuredEvent("connection.worker.started", { kind: data.kind, installationId: data.installationId, operationId: data.operationId });
  if (data.kind === "discover") {
    await runDiscovery(data, dependencies);
  } else {
    await runVerification(data, dependencies);
  }
  structuredEvent("connection.worker.finished", { kind: data.kind, installationId: data.installationId });
}

export async function runConnectionWorker(): Promise<void> {
  const worker = new Worker<ConnectionJobData>(
    QUEUE_NAMES.connection,
    async (job) => {
      const data = job.data;
      await processConnectionJob(data);
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: getNumberEnv("WORKER_CONNECTION_CONCURRENCY", 2),
    },
  );

  worker.on("failed", (job, error) => {
    structuredEvent("connection.worker.job_failed", {
      jobId: job?.id ?? null,
      error: error.message,
    }, "error");
    void (async () => {
      const data = job?.data as ConnectionJobData | undefined;
      if (!data) {
        return;
      }
      const operation = await prisma.operation.findUnique({ where: { id: data.operationId } });
      if (!operation) {
        return;
      }
      if (operation.status !== "failed") {
        await failOperation(data.operationId, {
          errorCode: "connection_job_failed",
          errorSummary: error.message,
          retryable: true,
        });
      }
    })();
  });

  worker.on("completed", (job) => {
    structuredEvent("connection.worker.job_completed", { jobId: job?.id ?? null });
    const data = job?.data as ConnectionJobData | undefined;
    if (!data) {
      return;
    }
    void (async () => {
      const operation = await prisma.operation.findUnique({ where: { id: data.operationId } });
      if (operation && (operation.status === "queued" || operation.status === "running" || operation.status === "retrying")) {
        const { completeOperation } = await import("../../studio/operations");
        await completeOperation(data.operationId);
      }
    })();
  });

  // eslint-disable-next-line no-console
  console.log("connection worker running");
}
