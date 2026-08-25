// Visual QA for the Magic Installer, Activity and Notifications surfaces.
// Usage:
//   E2E_EMAIL=... E2E_PASSWORD=... node scripts/qa-visual-installer.mjs
// Screenshots land in test-results/visual-qa/ and an overflow report prints.
import { chromium } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';
const BASE = process.env.E2E_BASE_URL || 'https://auctorio.com';

const WIDTHS = [320, 375, 768, 1280, 1440];
const THEMES = ['light', 'dark'];
const PAGES = [
  { path: '/studio/connections', name: 'connections' },
  { path: '/studio/connections/wizard', name: 'wizard' },
  { path: '/studio/activity', name: 'activity' },
  { path: '/studio/notifications', name: 'notifications' },
];

if (!EMAIL || !PASSWORD) {
  console.error('E2E_EMAIL and E2E_PASSWORD are required');
  process.exit(2);
}

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

// Login through the API and persist the session cookie.
const login = await context.request.post('/studio/api/auth/login/password', {
  data: { email: EMAIL, password: PASSWORD },
});
if (!login.ok()) {
  console.error('login failed', login.status());
  process.exit(2);
}

const report = [];
for (const width of WIDTHS) {
  for (const theme of THEMES) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    for (const target of PAGES) {
      await page.goto(`${BASE}${target.path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => {
        const doc = document.scrollingElement || document.documentElement;
        return { scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth };
      });
      const hasOverflow = overflow.scrollWidth > overflow.innerWidth + 1;
      const shot = `test-results/visual-qa/${target.name}-${width}-${theme}.png`;
      await page.screenshot({ path: shot, fullPage: false });
      report.push({ page: target.name, width, theme, hasOverflow, scrollWidth: overflow.scrollWidth, innerWidth: overflow.innerWidth, shot });
    }
  }
}

console.log(JSON.stringify(report, null, 2));
const overflowRows = report.filter((row) => row.hasOverflow);
console.log(`\n${report.length} screenshots captured; ${overflowRows.length} page(s) with horizontal overflow`);
await browser.close();
process.exit(overflowRows.length > 0 ? 1 : 0);
