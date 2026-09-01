// Live source verification (opt-in, network required).
//
//   npm run verify:sources:live -- --max 8
//
// Verifies the movie-tv-en pack endpoints against the live web and prints the
// source support matrix (SOURCE | ADAPTER | DISCOVERY METHOD | STATUS |
// LAST VERIFIED | RESTRICTIONS | NOTES). A source is only labelled "verified"
// when its current endpoint actually responded and parsed in this run.

import { MOVIE_TV_EN_PACK } from "../src/studio/source-packs/movie-tv-en";
import { verifyFeedCandidate } from "../src/studio/feed-discovery";
import type { SourcePackEntry } from "../src/studio/source-packs/types";

type MatrixRow = {
  source: string;
  adapter: string;
  discoveryMethod: string;
  endpoint: string;
  status: "verified" | "failed" | "unsupported" | "skipped";
  verifiedAt: string;
  restrictions: string;
  notes: string;
};

function pad(value: string, width: number): string {
  return value.length > width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const maxFlag = args.indexOf("--max");
  const max = maxFlag >= 0 ? Number.parseInt(args[maxFlag + 1] ?? "8", 10) : 8;
  const includeSitemaps = args.includes("--all");
  const limit = Number.isFinite(max) && max > 0 ? max : 8;

  const entries: SourcePackEntry[] = includeSitemaps ? MOVIE_TV_EN_PACK.entries : MOVIE_TV_EN_PACK.entries.slice(0, limit);
  const rows: MatrixRow[] = [];
  const now = new Date().toISOString().slice(0, 10);

  console.log(`\nAuctorio live source verification — ${new Date().toISOString()}`);
  console.log(`Pack: ${MOVIE_TV_EN_PACK.key} (${entries.length} endpoints, adapter ${MOVIE_TV_EN_PACK.entries[0].adapter})\n`);

  for (const entry of entries) {
    process.stdout.write(`  verifying ${entry.name} … `);
    const result = await verifyFeedCandidate(entry.endpoint);
    const status: MatrixRow["status"] = result.verified ? "verified" : "failed";
    console.log(result.verified ? `OK (${result.type}, ${result.itemCount ?? "?"} items)` : `FAILED (${result.note ?? "no response"})`);
    rows.push({
      source: entry.name,
      adapter: entry.adapter,
      discoveryMethod: entry.discoveryMethod,
      endpoint: entry.endpoint,
      status,
      verifiedAt: result.verified ? now : "-",
      restrictions: entry.restrictions ?? "-",
      notes: entry.notes ?? "-",
    });
  }

  console.log("\nSOURCE SUPPORT MATRIX");
  console.log("-".repeat(150));
  console.log(
    [pad("SOURCE", 28), pad("ADAPTER", 9), pad("DISCOVERY METHOD", 17), pad("STATUS", 11), pad("LAST VERIFIED", 12), pad("RESTRICTIONS", 30), "NOTES"].join(" | "),
  );
  console.log("-".repeat(150));
  for (const row of rows) {
    console.log(
      [
        pad(row.source, 28),
        pad(row.adapter, 9),
        pad(row.discoveryMethod, 17),
        pad(row.status, 11),
        pad(row.verifiedAt, 12),
        pad(row.restrictions, 30),
        row.notes,
      ].join(" | "),
    );
  }
  console.log("-".repeat(150));

  const verified = rows.filter((row) => row.status === "verified").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  console.log(`\nSummary: ${verified} verified, ${failed} failed, ${rows.length} checked.`);
  console.log("A source is only labelled verified when its current endpoint responded correctly in this run.\n");

  if (verified === 0) {
    process.exitCode = 1;
  }
}

void main();
