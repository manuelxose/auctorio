/**
 * Platform credentials verification — reads the QA credentials inventory and
 * verifies every documented account against the live endpoints. Read-only:
 * no content is created or mutated on any platform.
 *
 * Usage: npx ts-node scripts/verify-platform-credentials.ts [--platform guiatv]
 *
 * Exits 0 when all checks pass, 1 otherwise.
 * Never prints passwords or tokens.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const CREDENTIALS_PATH =
  process.env["QA_CREDENTIALS_PATH"] || "/var/www/.qa-artifacts/platform-test-credentials.json";

type Account = {
  label?: string;
  role?: string;
  email: string;
  password?: string;
  platformRole?: string;
  status?: string;
  deprecated?: boolean;
};

type Workspace = {
  slug: string;
  tenantId: string;
  accounts: Account[];
};

type PlatformEntry = {
  platform: string;
  appUrl: string;
  loginUrl?: string;
  studioUrl?: string;
  authStatus: string;
  notes?: string;
  accounts?: Account[];
  workspaces?: Workspace[];
  tenantId?: string;
};

type Inventory = {
  generatedAt?: string;
  platforms: Record<string, PlatformEntry>;
};

type CheckResult = {
  label: string;
  ok: boolean;
  detail: string;
};

async function jsonRequest(
  url: string,
  method: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<{ status: number; text: string }> {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  return { status: response.status, text };
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

async function checkAuthEndpoint(
  platform: string,
  url: string,
  account: Account,
  payloadKey: "email" | "username" = "email",
): Promise<CheckResult> {
  const label = `${platform} · ${account.label ?? account.email}`;
  try {
    const result = await jsonRequest(url, "POST", {
      [payloadKey]: account.email,
      password: account.password,
    });

    if (result.status >= 200 && result.status < 300 && result.text.includes(account.email)) {
      return { label, ok: true, detail: `HTTP ${result.status} (identity echoed)` };
    }

    if (result.status >= 200 && result.status < 300) {
      return { label, ok: true, detail: `HTTP ${result.status} (identity not echoed: ${truncate(result.text, 80)})` };
    }

    return { label, ok: false, detail: `HTTP ${result.status}: ${truncate(result.text, 120)}` };
  } catch (error) {
    return {
      label,
      ok: false,
      detail: `request failed: ${(error as { cause?: { code?: string } })?.cause?.code || (error as Error).message}`,
    };
  }
}

async function checkAuctorioLogin(account: Account): Promise<CheckResult> {
  const label = `auctorio · ${account.label ?? account.email}`;
  try {
    const result = await jsonRequest("https://auctorio.com/studio/api/auth/login/password", "POST", {
      email: account.email,
      password: account.password,
    });

    if (result.status !== 200) {
      return { label, ok: false, detail: `HTTP ${result.status}: ${truncate(result.text, 120)}` };
    }

    const session = JSON.parse(result.text) as {
      user?: { email?: string };
      role?: string;
      sites?: Array<{ key: string; name: string; role: string }>;
      activeSiteId?: string | null;
    };

    if (session.user?.email !== account.email) {
      return { label, ok: false, detail: `session email mismatch: ${session.user?.email ?? "missing"}` };
    }

    const sites = session.sites ?? [];
    if (sites.length === 0) {
      return { label, ok: false, detail: "no sites in session" };
    }

    return {
      label,
      ok: true,
      detail: `role=${session.role ?? "?"} sites=[${sites
        .map((site) => `${site.key}:${site.role}`)
        .join(", ")}] active=${session.activeSiteId ? "set" : "null"}`,
    };
  } catch (error) {
    return { label, ok: false, detail: `request failed: ${(error as Error).message}` };
  }
}

async function checkPublicSite(platform: string, url: string): Promise<CheckResult> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "follow" });
    return {
      label: `${platform} · public site`,
      ok: response.status >= 200 && response.status < 400,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return { label: `${platform} · public site`, ok: false, detail: `request failed: ${(error as Error).message}` };
  }
}

async function main() {
  const filter = process.argv.find((arg) => arg.startsWith("--platform="))?.split("=")[1];
  const raw = readFileSync(path.resolve(CREDENTIALS_PATH), "utf8");
  const inventory = JSON.parse(raw) as Inventory;

  const results: CheckResult[] = [];

  for (const [key, platform] of Object.entries(inventory.platforms)) {
    if (filter && key !== filter) {
      continue;
    }

    if (platform.platform === "electroria") {
      results.push(await checkPublicSite(platform.platform, platform.appUrl));
      continue;
    }

    if (platform.platform === "auctorio") {
      for (const workspace of platform.workspaces ?? []) {
        for (const account of workspace.accounts ?? []) {
          results.push(await checkAuctorioLogin(account));
        }
      }
      continue;
    }

    if (platform.platform === "guiatv") {
      for (const account of platform.accounts ?? []) {
        results.push(await checkAuthEndpoint("guiatv", `${platform.appUrl}/v2/auth/login`, account));
      }
      continue;
    }

    if (platform.platform === "talkaris") {
      for (const account of platform.accounts ?? []) {
        results.push(await checkAuthEndpoint("talkaris", `${platform.appUrl}/api/v1/auth/login`, account));
      }
      continue;
    }

    if (platform.platform === "webtecnoria") {
      for (const account of platform.accounts ?? []) {
        results.push(await checkAuthEndpoint("webtecnoria", `${platform.appUrl}/api/v1/auth/login`, account));
      }
      continue;
    }

    results.push(await checkPublicSite(platform.platform, platform.appUrl));
  }

  console.log("PLATFORM CREDENTIAL VERIFICATION");
  console.log("================================");
  let failed = 0;
  for (const result of results) {
    console.log(`${result.ok ? "✓" : "✗"} ${result.label}`);
    if (!result.ok) {
      failed += 1;
    }
    console.log(`   ${result.detail}`);
  }

  console.log("================================");
  console.log(`${results.length - failed}/${results.length} checks passed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("VERIFICATION FATAL:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
