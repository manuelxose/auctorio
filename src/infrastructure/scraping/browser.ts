import { createRequire } from "node:module";

// Headless-browser fetch for sources protected by WAF/JS challenges
// (e.g. Filmaffinity behind Cloudflare). Uses the Playwright Chromium that is
// already installed for E2E. Resolved lazily so the API stays functional on
// hosts without Playwright — sources configured with engine:"browser" will
// simply report a clear error instead of crashing the worker.

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export type BrowserFetchOptions = {
  timeoutMs?: number;
  /** Extra settle time after DOMContentLoaded to let challenge/cards hydrate. */
  settleMs?: number;
  locale?: string;
};

/** Minimal structural typing so this module compiles without importing playwright types. */
type BrowserPage = {
  goto: (url: string, options: { waitUntil: string; timeout: number }) => Promise<{ status: () => number } | null>;
  waitForTimeout: (ms: number) => Promise<void>;
  content: () => Promise<string>;
};

type BrowserHandle = {
  newPage: (options: { userAgent: string; locale: string }) => Promise<BrowserPage>;
  close: () => Promise<void>;
};

export async function fetchHtmlWithBrowser(url: string, options: BrowserFetchOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const settleMs = options.settleMs ?? 6_000;
  const locale = options.locale ?? "es-ES";

  let launcher: { launch: (options: { headless: boolean }) => Promise<BrowserHandle> } | undefined;
  try {
    const require = createRequire(__filename);
    launcher = require("playwright").chromium as { launch: (options: { headless: boolean }) => Promise<BrowserHandle> };
  } catch {
    throw new Error("browser_engine_unavailable");
  }

  if (!launcher) {
    throw new Error("browser_engine_unavailable");
  }

  const browser = await launcher.launch({ headless: true });
  try {
    const page = await browser.newPage({ userAgent: BROWSER_USER_AGENT, locale });
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    if (response && response.status() >= 400) {
      throw new Error(`browser_fetch_failed status=${response.status()}`);
    }
    await page.waitForTimeout(settleMs);
    return await page.content();
  } finally {
    await browser.close().catch(() => undefined);
  }
}
