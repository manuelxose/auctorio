import test from "node:test";
import assert from "node:assert/strict";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";

const PRIVATE_PROVIDER_PATTERN = /\bDeepSeek\b|\bFLUX\b|\bSiliconFlow\b|\bFal\.ai\b/i;

type MockBackend = {
  url: string;
  close: () => Promise<void>;
  getLastAuthorizationHeader: () => string | undefined;
};

async function createMockBackendServer(): Promise<MockBackend> {
  let lastAuthorizationHeader: string | undefined;

  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (req.url === "/v2/session/me" && req.method === "GET") {
      if (req.headers.authorization !== "Bearer live-api-key") {
        res.statusCode = 401;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          tenant: {
            id: "tenant-1",
            name: "Studio tenant",
            status: "active",
          },
          siteCount: 2,
          projectCount: 5,
        }),
      );
      return;
    }

    if (req.url === "/v2/sites" && req.method === "GET") {
      lastAuthorizationHeader = req.headers.authorization;
      if (req.headers.authorization !== "Bearer live-api-key") {
        res.statusCode = 401;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "not_found" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("mock_backend_address_unavailable");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
    getLastAuthorizationHeader: () => lastAuthorizationHeader,
  };
}

async function getFreePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("free_port_unavailable");
  }

  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  return port;
}

async function waitForServer(url: string): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore until the next retry.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`server_not_ready ${url}`);
}

async function startStudioServer(backendUrl: string): Promise<{
  baseUrl: string;
  process: ChildProcess;
  close: () => Promise<void>;
}> {
  const port = await getFreePort();
  const child = spawn(
    "node",
    ["/var/www/auctorio/apps/studio-web/dist/studio-web/server/server.mjs"],
    {
      cwd: "/var/www/auctorio/apps/studio-web",
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: "production",
        STUDIO_BASE_PATH: "/studio",
        STUDIO_API_INTERNAL_URL: backendUrl,
        STUDIO_SESSION_SECRET: "studio-test-secret",
        STUDIO_COOKIE_NAME: "studio_session",
        STUDIO_COOKIE_SECURE: "false",
        STUDIO_ALLOWED_HOSTS: "127.0.0.1,localhost",
        STUDIO_ENABLE_OPS_LOGIN: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout?.on("data", () => {
    // Intentionally ignored. Keeping the listener drains the buffer in long test runs.
  });
  child.stderr?.on("data", () => {
    // Intentionally ignored. Keeping the listener drains the buffer in long test runs.
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(`${baseUrl}/studio/health`);

  return {
    baseUrl,
    process: child,
    close: async () => {
      if (child.exitCode !== null) {
        return;
      }

      child.kill("SIGTERM");
      await once(child, "exit");
    },
  };
}

let backend: MockBackend;
let studio: Awaited<ReturnType<typeof startStudioServer>>;

test.before(async () => {
  backend = await createMockBackendServer();
  studio = await startStudioServer(backend.url);
});

test.after(async () => {
  await studio.close();
  await backend.close();
});

test("public home renders the Auctorio landing without redirecting to the studio login", async () => {
  const response = await fetch(`${studio.baseUrl}/`, {
    redirect: "manual",
  });

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Auctorio/);
  assert.match(html, /AI content operations platform/i);
  assert.doesNotMatch(html, PRIVATE_PROVIDER_PATTERN);
});

test("english and spanish public routes render without redirecting to the studio", async () => {
  const spanish = await fetch(`${studio.baseUrl}/es`, {
    redirect: "manual",
  });

  assert.equal(spanish.status, 200);
  const html = await spanish.text();
  assert.match(html, /Operaciones de contenido con IA para publishers/i);
  assert.doesNotMatch(html, PRIVATE_PROVIDER_PATTERN);
});

test("robots.txt and segmented sitemaps expose only the public surface", async () => {
  const robotsResponse = await fetch(`${studio.baseUrl}/robots.txt`);
  assert.equal(robotsResponse.status, 200);
  const robots = await robotsResponse.text();
  assert.match(robots, /Disallow: \/studio/);
  assert.match(robots, /Sitemap: http:\/\/127\.0\.0\.1:\d+\/sitemap\.xml/);

  const sitemapIndexResponse = await fetch(`${studio.baseUrl}/sitemap.xml`);
  assert.equal(sitemapIndexResponse.status, 200);
  const sitemapIndex = await sitemapIndexResponse.text();
  assert.match(sitemapIndex, /sitemap-en\.xml/);
  assert.match(sitemapIndex, /sitemap-es\.xml/);
  assert.match(sitemapIndex, /sitemap-images\.xml/);

  const sitemapEnResponse = await fetch(`${studio.baseUrl}/sitemap-en.xml`);
  assert.equal(sitemapEnResponse.status, 200);
  const sitemapEn = await sitemapEnResponse.text();
  assert.match(sitemapEn, /<loc>http:\/\/127\.0\.0\.1:\d+\/<\/loc>/);
  assert.match(sitemapEn, /<loc>http:\/\/127\.0\.0\.1:\d+\/use-cases<\/loc>/);
  assert.doesNotMatch(sitemapEn, /\/studio/);

  const sitemapEsResponse = await fetch(`${studio.baseUrl}/sitemap-es.xml`);
  assert.equal(sitemapEsResponse.status, 200);
  const sitemapEs = await sitemapEsResponse.text();
  assert.match(sitemapEs, /<loc>http:\/\/127\.0\.0\.1:\d+\/es<\/loc>/);
  assert.match(sitemapEs, /casos-de-uso/);
  assert.doesNotMatch(sitemapEs, /\/studio/);

  const imageSitemapResponse = await fetch(`${studio.baseUrl}/sitemap-images.xml`);
  assert.equal(imageSitemapResponse.status, 200);
  const imageSitemap = await imageSitemapResponse.text();
  assert.match(imageSitemap, /publisher-command-center-1600\.webp/);
  assert.match(imageSitemap, /search-led-newsroom-1600\.webp/);
});

test("studio SSR redirects unauthenticated users to /studio/login", async () => {
  const response = await fetch(`${studio.baseUrl}/studio/`, {
    redirect: "manual",
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/studio/login?returnTo=%2Fstudio%2F");
});

test("studio login route remains public", async () => {
  const response = await fetch(`${studio.baseUrl}/studio/login`, {
    redirect: "manual",
  });

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Auctorio/);
  assert.match(html, /<app-root><\/app-root>/i);
});

test("studio login stores an encrypted HttpOnly cookie and session/me returns the tenant summary", async () => {
  const loginResponse = await fetch(`${studio.baseUrl}/studio/api/session/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ apiKey: "live-api-key" }),
    redirect: "manual",
  });

  assert.equal(loginResponse.status, 200);
  const setCookie = loginResponse.headers.get("set-cookie");
  assert.ok(setCookie);
  assert.match(String(setCookie), /HttpOnly/);
  assert.match(String(setCookie), /SameSite=Lax/);
  assert.doesNotMatch(String(setCookie), /live-api-key/);

  const cookie = String(setCookie).split(";")[0];
  const sessionResponse = await fetch(`${studio.baseUrl}/studio/api/session/me`, {
    headers: {
      Cookie: cookie,
    },
  });

  assert.equal(sessionResponse.status, 200);
  const payload = (await sessionResponse.json()) as {
    tenant: { id: string; name: string };
    siteCount: number;
    projectCount: number;
  };
  assert.equal(payload.tenant.id, "tenant-1");
  assert.equal(payload.siteCount, 2);
  assert.equal(payload.projectCount, 5);
});

test("studio backend proxy injects Authorization from the encrypted session cookie and logout clears the session", async () => {
  const loginResponse = await fetch(`${studio.baseUrl}/studio/api/session/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ apiKey: "live-api-key" }),
  });
  const setCookie = loginResponse.headers.get("set-cookie");
  assert.ok(setCookie);
  const cookie = String(setCookie).split(";")[0];

  const proxied = await fetch(`${studio.baseUrl}/studio/api/backend/v2/sites`, {
    headers: {
      Cookie: cookie,
    },
  });

  assert.equal(proxied.status, 200);
  assert.equal(backend.getLastAuthorizationHeader(), "Bearer live-api-key");

  const logout = await fetch(`${studio.baseUrl}/studio/api/session/logout`, {
    method: "POST",
    headers: {
      Cookie: cookie,
    },
  });
  assert.equal(logout.status, 200);
  const clearedCookieHeader = String(logout.headers.get("set-cookie"));
  assert.match(clearedCookieHeader, /Max-Age=0/);
  const clearedCookie = clearedCookieHeader.split(";")[0];

  const sessionAfterLogout = await fetch(`${studio.baseUrl}/studio/api/session/me`, {
    headers: {
      Cookie: clearedCookie,
    },
  });
  assert.equal(sessionAfterLogout.status, 401);
});
