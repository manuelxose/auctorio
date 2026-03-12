"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const node_http_1 = __importDefault(require("node:http"));
const node_child_process_1 = require("node:child_process");
const node_events_1 = require("node:events");
const PRIVATE_PROVIDER_PATTERN = /\bDeepSeek\b|\bFLUX\b|\bSiliconFlow\b|\bFal\.ai\b/i;
async function createMockBackendServer() {
    let lastAuthorizationHeader;
    const server = node_http_1.default.createServer(async (req, res) => {
        const chunks = [];
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
            res.end(JSON.stringify({
                tenant: {
                    id: "tenant-1",
                    name: "Studio tenant",
                    status: "active",
                },
                siteCount: 2,
                projectCount: 5,
            }));
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
            res.end(JSON.stringify({
                items: [],
                page: 1,
                pageSize: 20,
                total: 0,
            }));
            return;
        }
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "not_found" }));
    });
    await new Promise((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("mock_backend_address_unavailable");
    }
    return {
        url: `http://127.0.0.1:${address.port}`,
        close: async () => {
            await new Promise((resolve, reject) => {
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
async function getFreePort() {
    const server = node_http_1.default.createServer();
    await new Promise((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("free_port_unavailable");
    }
    const port = address.port;
    await new Promise((resolve, reject) => {
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
async function waitForServer(url) {
    for (let index = 0; index < 100; index += 1) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return;
            }
        }
        catch {
            // Ignore until the next retry.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`server_not_ready ${url}`);
}
async function startStudioServer(backendUrl) {
    const port = await getFreePort();
    const child = (0, node_child_process_1.spawn)("node", ["/var/www/auctorio/apps/studio-web/dist/studio-web/server/server.mjs"], {
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
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
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
            await (0, node_events_1.once)(child, "exit");
        },
    };
}
let backend;
let studio;
node_test_1.default.before(async () => {
    backend = await createMockBackendServer();
    studio = await startStudioServer(backend.url);
});
node_test_1.default.after(async () => {
    await studio.close();
    await backend.close();
});
(0, node_test_1.default)("public home renders the Auctorio landing without redirecting to the studio login", async () => {
    const response = await fetch(`${studio.baseUrl}/`, {
        redirect: "manual",
    });
    strict_1.default.equal(response.status, 200);
    const html = await response.text();
    strict_1.default.match(html, /Auctorio/);
    strict_1.default.match(html, /AI content operations platform/i);
    strict_1.default.doesNotMatch(html, PRIVATE_PROVIDER_PATTERN);
});
(0, node_test_1.default)("english and spanish public routes render without redirecting to the studio", async () => {
    const spanish = await fetch(`${studio.baseUrl}/es`, {
        redirect: "manual",
    });
    strict_1.default.equal(spanish.status, 200);
    const html = await spanish.text();
    strict_1.default.match(html, /Operaciones de contenido con IA para publishers/i);
    strict_1.default.doesNotMatch(html, PRIVATE_PROVIDER_PATTERN);
});
(0, node_test_1.default)("robots.txt and segmented sitemaps expose only the public surface", async () => {
    const robotsResponse = await fetch(`${studio.baseUrl}/robots.txt`);
    strict_1.default.equal(robotsResponse.status, 200);
    const robots = await robotsResponse.text();
    strict_1.default.match(robots, /Disallow: \/studio/);
    strict_1.default.match(robots, /Sitemap: http:\/\/127\.0\.0\.1:\d+\/sitemap\.xml/);
    const sitemapIndexResponse = await fetch(`${studio.baseUrl}/sitemap.xml`);
    strict_1.default.equal(sitemapIndexResponse.status, 200);
    const sitemapIndex = await sitemapIndexResponse.text();
    strict_1.default.match(sitemapIndex, /sitemap-en\.xml/);
    strict_1.default.match(sitemapIndex, /sitemap-es\.xml/);
    strict_1.default.match(sitemapIndex, /sitemap-images\.xml/);
    const sitemapEnResponse = await fetch(`${studio.baseUrl}/sitemap-en.xml`);
    strict_1.default.equal(sitemapEnResponse.status, 200);
    const sitemapEn = await sitemapEnResponse.text();
    strict_1.default.match(sitemapEn, /<loc>http:\/\/127\.0\.0\.1:\d+\/<\/loc>/);
    strict_1.default.match(sitemapEn, /<loc>http:\/\/127\.0\.0\.1:\d+\/use-cases<\/loc>/);
    strict_1.default.doesNotMatch(sitemapEn, /\/studio/);
    const sitemapEsResponse = await fetch(`${studio.baseUrl}/sitemap-es.xml`);
    strict_1.default.equal(sitemapEsResponse.status, 200);
    const sitemapEs = await sitemapEsResponse.text();
    strict_1.default.match(sitemapEs, /<loc>http:\/\/127\.0\.0\.1:\d+\/es<\/loc>/);
    strict_1.default.match(sitemapEs, /casos-de-uso/);
    strict_1.default.doesNotMatch(sitemapEs, /\/studio/);
    const imageSitemapResponse = await fetch(`${studio.baseUrl}/sitemap-images.xml`);
    strict_1.default.equal(imageSitemapResponse.status, 200);
    const imageSitemap = await imageSitemapResponse.text();
    strict_1.default.match(imageSitemap, /publisher-command-center-1600\.webp/);
    strict_1.default.match(imageSitemap, /search-led-newsroom-1600\.webp/);
});
(0, node_test_1.default)("studio SSR redirects unauthenticated users to /studio/login", async () => {
    const response = await fetch(`${studio.baseUrl}/studio/`, {
        redirect: "manual",
    });
    strict_1.default.equal(response.status, 302);
    strict_1.default.equal(response.headers.get("location"), "/studio/login");
});
(0, node_test_1.default)("studio login route remains public", async () => {
    const response = await fetch(`${studio.baseUrl}/studio/login`, {
        redirect: "manual",
    });
    strict_1.default.equal(response.status, 200);
    const html = await response.text();
    strict_1.default.match(html, /cockpit editorial para operar múltiples webs con IA/i);
    strict_1.default.match(html, /Continue with SSO/);
});
(0, node_test_1.default)("studio login stores an encrypted HttpOnly cookie and session/me returns the tenant summary", async () => {
    const loginResponse = await fetch(`${studio.baseUrl}/studio/api/session/login`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify({ apiKey: "live-api-key" }),
        redirect: "manual",
    });
    strict_1.default.equal(loginResponse.status, 200);
    const setCookie = loginResponse.headers.get("set-cookie");
    strict_1.default.ok(setCookie);
    strict_1.default.match(String(setCookie), /HttpOnly/);
    strict_1.default.match(String(setCookie), /SameSite=Lax/);
    strict_1.default.doesNotMatch(String(setCookie), /live-api-key/);
    const cookie = String(setCookie).split(";")[0];
    const sessionResponse = await fetch(`${studio.baseUrl}/studio/api/session/me`, {
        headers: {
            Cookie: cookie,
        },
    });
    strict_1.default.equal(sessionResponse.status, 200);
    const payload = (await sessionResponse.json());
    strict_1.default.equal(payload.tenant.id, "tenant-1");
    strict_1.default.equal(payload.siteCount, 2);
    strict_1.default.equal(payload.projectCount, 5);
});
(0, node_test_1.default)("studio backend proxy injects Authorization from the encrypted session cookie and logout clears the session", async () => {
    const loginResponse = await fetch(`${studio.baseUrl}/studio/api/session/login`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify({ apiKey: "live-api-key" }),
    });
    const setCookie = loginResponse.headers.get("set-cookie");
    strict_1.default.ok(setCookie);
    const cookie = String(setCookie).split(";")[0];
    const proxied = await fetch(`${studio.baseUrl}/studio/api/backend/v2/sites`, {
        headers: {
            Cookie: cookie,
        },
    });
    strict_1.default.equal(proxied.status, 200);
    strict_1.default.equal(backend.getLastAuthorizationHeader(), "Bearer live-api-key");
    const logout = await fetch(`${studio.baseUrl}/studio/api/session/logout`, {
        method: "POST",
        headers: {
            Cookie: cookie,
        },
    });
    strict_1.default.equal(logout.status, 200);
    const clearedCookieHeader = String(logout.headers.get("set-cookie"));
    strict_1.default.match(clearedCookieHeader, /Max-Age=0/);
    const clearedCookie = clearedCookieHeader.split(";")[0];
    const sessionAfterLogout = await fetch(`${studio.baseUrl}/studio/api/session/me`, {
        headers: {
            Cookie: clearedCookie,
        },
    });
    strict_1.default.equal(sessionAfterLogout.status, 401);
});
