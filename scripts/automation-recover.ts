// Phase 6 — recovery CLI for existing automatic projects stuck in legacy
// states (qa_failed, qa_passed, in_review, approved, publish_failed).
//
// Usage:
//   npm run automation:recover -- --dry-run
//   npm run automation:recover -- --site=<siteId>
//   npm run automation:recover -- --tenant=<tenantId> --site=<siteId> --dry-run
//
// Idempotent: safe to run repeatedly and alongside the automation worker.
// This is an administrative CLI: without --tenant it covers ALL tenants.

import { recoverStuckAutoProjects } from "../src/studio/automation-recovery";
import { getPrismaClient } from "../src/infrastructure/db/prisma";

function parseArgs(argv: string[]): { siteId?: string; tenantId?: string; dryRun: boolean } {
  let siteId: string | undefined;
  let tenantId: string | undefined;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--site=")) {
      siteId = arg.slice("--site=".length);
    } else if (arg.startsWith("--tenant=")) {
      tenantId = arg.slice("--tenant=".length);
    }
  }
  return { siteId, tenantId, dryRun };
}

async function main(): Promise<void> {
  const { siteId, tenantId, dryRun } = parseArgs(process.argv.slice(2));

  console.log(`automation:recover ${dryRun ? "(DRY RUN)" : "(LIVE)"}${tenantId ? ` tenant=${tenantId}` : " all tenants"}${siteId ? ` site=${siteId}` : ""}`);
  const prisma = getPrismaClient();
  await prisma.$connect();

  try {
    const report = await recoverStuckAutoProjects({ tenantId, siteId: siteId ?? null, dryRun });

    console.log("");
    console.log(`scanned=${report.scanned} eligible=${report.eligible} acted=${report.acted}`);
    console.log("");
    for (const item of report.items) {
      console.log(`${item.projectId}\t${item.action}\t${item.result}${item.detail ? `\t${item.detail}` : ""}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
