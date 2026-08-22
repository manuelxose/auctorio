// Temporary smoke script for the editorial platform endpoints.
const crypto = require("node:crypto");

const BASE = "http://127.0.0.1:3999";
const SECRET = process.env.STUDIO_PROXY_SHARED_SECRET || "studio-proxy-dev-secret-change-me";
const TENANT_ID = process.argv[2];

function signedHeaders(method, url) {
  const tenantId = TENANT_ID;
  const userId = "smoke-user";
  const sessionId = "smoke-session";
  const permissions = ["workspace.manage", "projects.manage", "publishing.manage", "integrations.manage", "analytics.read", "users.manage", "roles.manage", "prompts.manage", "review.approve"];
  const timestamp = String(Date.now());
  const payload = [method.toUpperCase(), url, tenantId, userId, sessionId, permissions.join(","), timestamp].join("\n");
  const signature = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return {
    "x-studio-tenant-id": tenantId,
    "x-studio-user-id": userId,
    "x-studio-session-id": sessionId,
    "x-studio-permissions": permissions.join(","),
    "x-studio-timestamp": timestamp,
    "x-studio-signature": signature,
  };
}

async function call(method, path, body) {
  const url = `${BASE}${path}`;
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json", ...signedHeaders(method, path) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = await response.text();
  }
  return { status: response.status, data };
}

async function main() {
  const results = [];
  const check = (name, status, okStatuses = [200, 201, 202]) => {
    results.push(`${okStatuses.includes(status) ? "PASS" : "FAIL"} ${name} (${status})`);
  };

  const overview = await call("GET", "/v2/overview");
  check("GET /v2/overview", overview.status);

  const sourcesList = await call("GET", "/v2/sources");
  check("GET /v2/sources", sourcesList.status);

  const created = await call("POST", "/v2/sources", {
    name: "smoke-rss-source",
    type: "rss",
    url: "https://example.com/feed.xml",
    refreshIntervalMinutes: 60,
  });
  check("POST /v2/sources", created.status);
  const sourceId = created.data?.id;

  if (sourceId) {
    const fetched = await call("POST", `/v2/sources/${sourceId}/fetch`);
    check("POST /v2/sources/:id/fetch (safe fail w/o network)", [200, 502].includes(fetched.status) ? fetched.status : fetched.status);

    const deleted = await call("DELETE", `/v2/sources/${sourceId}`);
    check("DELETE /v2/sources/:id", deleted.status);
  }

  const inbox = await call("GET", "/v2/source-items?page=1&pageSize=5");
  check("GET /v2/source-items", inbox.status);

  const clusters = await call("GET", "/v2/story-clusters");
  check("GET /v2/story-clusters", clusters.status);

  const publications = await call("GET", "/v2/publications?page=1&pageSize=5");
  check("GET /v2/publications", publications.status);

  const calendar = await call("GET", "/v2/calendar?from=2026-08-01&to=2026-09-30");
  check("GET /v2/calendar", calendar.status);

  const projects = await call("GET", "/v2/projects?page=1&pageSize=3");
  check("GET /v2/projects", projects.status);

  const automation = await call("GET", "/v2/automation");
  check("GET /v2/automation", automation.status);

  const automationStatus = await call("GET", "/v2/automation/status");
  check("GET /v2/automation/status", automationStatus.status);

  const accounts = await call("GET", "/v2/publishing-accounts");
  check("GET /v2/publishing-accounts", accounts.status);

  const workers = await call("GET", "/v2/health/workers");
  check("GET /v2/health/workers", workers.status);

  const campaigns = await call("GET", "/v2/campaigns");
  check("GET /v2/campaigns", campaigns.status);

  const briefs = await call("GET", "/v2/briefs");
  check("GET /v2/briefs", briefs.status);

  const audit = await call("GET", "/v2/audit?page=1&pageSize=5");
  check("GET /v2/audit", audit.status);

  console.log(results.join("\n"));
  console.log("---overview sample---");
  console.log(JSON.stringify(overview.data, null, 2).slice(0, 800));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
