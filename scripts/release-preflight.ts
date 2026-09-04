// Read-only production preflight. It intentionally never creates, schedules
// or publishes content; operators use it before enabling autopilot.
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { getTenantReleaseReadiness } from "../src/studio/release-readiness";

function tenantIdFromArgs(argv: string[]): string {
  const value = argv.find((arg) => arg.startsWith("--tenant="))?.slice("--tenant=".length);
  if (!value) throw new Error("Usage: npm run ops:release-preflight -- --tenant=<tenantId>");
  return value;
}

async function main() {
  const report = await getTenantReleaseReadiness(tenantIdFromArgs(process.argv.slice(2)));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
}

main().finally(() => getPrismaClient().$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
