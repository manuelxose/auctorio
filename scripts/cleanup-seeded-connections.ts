import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { writeAudit } from "../src/studio/audit";

// ─────────────────────────────────────────────────────────────────────────────
// Seeded publishing-connection cleanup (explicit, idempotent, audited).
//
// This is the only sanctioned way to remove seeded publishing connections.
// It targets VERIFIED identifiers only — never broad domain-name deletes.
//
//   node dist/scripts/cleanup-seeded-connections.js --dry-run
//   node dist/scripts/cleanup-seeded-connections.js \
//     --account <publishingAccountId> [--account …]
//   node dist/scripts/cleanup-seeded-connections.js \
//     --tenant-site <tenantName>:<siteKey> [--tenant-site …]
//
// Behavior per matching publishing account:
//   - accounts with historical publications are NEVER deleted; they are
//     disabled and their credential references/ciphertext are cleared;
//   - accounts without publications are deleted;
//   - site records, projects, publications, audits and site intelligence are
//     never touched;
//   - connector installation drafts (draft/failed/cancelled) are deleted;
//   - every action writes an audit event and the script is safe to rerun.
// ─────────────────────────────────────────────────────────────────────────────

const prisma = getPrismaClient();

type Args = {
  dryRun: boolean;
  accounts: string[];
  tenantSites: string[];
};

function parseArgs(): Args {
  const args: Args = { dryRun: false, accounts: [], tenantSites: [] };
  const raw = process.argv.slice(2);
  for (let index = 0; index < raw.length; index += 1) {
    const flag = raw[index];
    const next = raw[index + 1];
    switch (flag) {
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--account":
        if (!next) {
          console.error("--account requires an id");
          process.exit(2);
        }
        args.accounts.push(next);
        index += 1;
        break;
      case "--tenant-site":
        if (!next || !next.includes(":")) {
          console.error("--tenant-site requires tenantName:siteKey");
          process.exit(2);
        }
        args.tenantSites.push(next);
        index += 1;
        break;
      case "--help":
        console.log(`
Usage: cleanup-seeded-connections.js [--dry-run] [--account <id>] [--tenant-site <tenantName>:<siteKey>]

Targets are explicit identifiers only. Run without targets to see a dry-run
candidate report (requires --dry-run).
`);
        process.exit(0);
        break;
      default:
        console.error(`unknown flag ${flag}`);
        process.exit(2);
    }
  }
  return args;
}

async function resolveTargets(args: Args): Promise<Array<{ id: string }>> {
  const targets = new Map<string, { id: string }>();

  for (const accountId of args.accounts) {
    const account = await prisma.publishingAccount.findUnique({ where: { id: accountId } });
    if (account) {
      targets.set(account.id, { id: account.id });
    } else {
      console.warn(`account ${accountId} not found — skipped`);
    }
  }

  for (const pair of args.tenantSites) {
    const [tenantName, siteKey] = pair.split(":");
    const tenant = await prisma.tenant.findUnique({ where: { name: tenantName } });
    if (!tenant) {
      console.warn(`tenant ${tenantName} not found — skipped`);
      continue;
    }
    const site = await prisma.site.findUnique({ where: { tenantId_key: { tenantId: tenant.id, key: siteKey } } });
    if (!site) {
      console.warn(`site ${pair} not found — skipped`);
      continue;
    }
    const accounts = await prisma.publishingAccount.findMany({
      where: { tenantId: tenant.id, OR: [{ siteId: site.id }, { siteId: null }] },
      select: { id: true, platform: true, displayName: true },
    });
    for (const account of accounts) {
      targets.set(account.id, { id: account.id });
    }
  }

  return Array.from(targets.values());
}

async function reportCandidates(): Promise<void> {
  // Dry-run report only: show seeded-looking candidates for operator review.
  // "Seeded" = legacy accounts that were never verified (no lastVerifiedAt)
  // or that carry a credentialsRef rather than OAuth ciphertext.
  const candidates = await prisma.publishingAccount.findMany({
    where: { provider: "legacy" },
    select: { id: true, tenantId: true, platform: true, displayName: true, credentialsRef: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Found ${candidates.length} legacy publishing account(s) (candidates, not touched):`);
  for (const candidate of candidates) {
    console.log(`  ${candidate.id}  ${candidate.platform.padEnd(9)} ${candidate.displayName}  ref=${candidate.credentialsRef ?? "-"}`);
  }
  console.log("Re-run with explicit --account or --tenant-site targets to act on them.");
}

async function cleanupAccount(accountId: string, dryRun: boolean): Promise<void> {
  const account = await prisma.publishingAccount.findUnique({
    where: { id: accountId },
    include: { publications: { select: { id: true }, take: 1 } },
  });
  if (!account) {
    console.warn(`account ${accountId} not found — skipped`);
    return;
  }

  const hasPublications = account.publications.length > 0;
  console.log(
    `${dryRun ? "[dry-run] " : ""}${hasPublications ? "disable + clear secrets" : "delete"} ` +
      `${account.platform} account "${account.displayName}" (${account.id})`,
  );

  if (dryRun) {
    return;
  }

  await writeAudit({
    tenantId: account.tenantId,
    actorType: "system",
    action: "connection.cleanup.started",
    entityType: "publishing_account",
    entityId: account.id,
    metadata: { platform: account.platform, displayName: account.displayName, hasPublications },
  });

  if (hasPublications) {
    // Never delete accounts with historical publications.
    await prisma.publishingAccount.update({
      where: { id: account.id },
      data: {
        enabled: false,
        status: "disabled",
        credentialsRef: null,
        credentialsCiphertext: null,
        connectionStatus: "disconnected",
        lastError: "cleaned_up_by_operator",
      },
    });
  } else {
    await prisma.publishingAccount.delete({ where: { id: account.id } });
  }

  await writeAudit({
    tenantId: account.tenantId,
    actorType: "system",
    action: "connection.cleanup.completed",
    entityType: "publishing_account",
    entityId: account.id,
    metadata: { platform: account.platform, displayName: account.displayName, mode: hasPublications ? "disabled" : "deleted" },
  });
  console.log(`  audited connection.cleanup.completed (${hasPublications ? "disabled" : "deleted"})`);
}

async function cleanupInstallationDrafts(dryRun: boolean): Promise<void> {
  const drafts = await prisma.connectorInstallation.findMany({
    where: { state: { in: ["draft", "failed", "cancelled"] } },
    select: { id: true, tenantId: true, kind: true, provider: true },
  });
  for (const draft of drafts) {
    console.log(`${dryRun ? "[dry-run] " : ""}delete installation draft ${draft.id} (${draft.kind}/${draft.provider})`);
    if (dryRun) {
      continue;
    }
    await prisma.connectorInstallation.delete({ where: { id: draft.id } });
    await writeAudit({
      tenantId: draft.tenantId,
      actorType: "system",
      action: "connection.cleanup.installation_deleted",
      entityType: "connector_installation",
      entityId: draft.id,
      metadata: { kind: draft.kind, provider: draft.provider },
    });
  }
}

async function main() {
  const args = parseArgs();
  const hasTargets = args.accounts.length > 0 || args.tenantSites.length > 0;

  if (!hasTargets) {
    if (!args.dryRun) {
      console.error("Refusing to run without --dry-run or explicit targets.");
      process.exit(2);
    }
    await reportCandidates();
    await cleanupInstallationDrafts(true);
    await prisma.$disconnect();
    return;
  }

  const targets = await resolveTargets(args);
  console.log(`${args.dryRun ? "DRY RUN" : "CLEANUP"} — ${targets.length} explicit target(s)`);
  for (const target of targets) {
    await cleanupAccount(target.id, args.dryRun);
  }
  await cleanupInstallationDrafts(args.dryRun);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
