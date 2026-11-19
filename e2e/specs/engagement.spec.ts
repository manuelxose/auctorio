import { expect, test } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:4420';

for (const platform of ['Reddit', 'Quora']) {
  test(`live ${platform}: find an opportunity, draft a reply and persist its status`, async ({ browser }) => {
    test.skip(process.env.E2E_ENGAGEMENT_LIVE !== '1', 'Requires a configured web search provider and a local Studio test account.');
    test.setTimeout(240_000);
    expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(baseURL).hostname);
    const context = await browser.newContext({ baseURL });
    try {
      const login = await context.request.post('/studio/api/auth/login/password', {
        data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
      });
      expect(login.status(), 'Studio test login').toBe(200);
      const page = await context.newPage();
      await page.goto(`/studio/opportunities?tab=${platform.toLowerCase()}`);
      const inbox = page.getByRole('region', { name: 'Bandeja de oportunidades' });
      await expect(inbox).toHaveAttribute('aria-busy', 'false');
      const existing = new Set(await inbox.getByRole('article').getByRole('heading').allTextContents());
      const search = page.getByRole('button', { name: 'Buscar ahora' });
      await expect(search, 'Search provider and site keywords must be configured').toBeEnabled();
      const operation = page.waitForResponse((response) => response.url().includes('/engagement/refresh') && response.request().method() === 'POST');
      await search.click();
      expect((await operation).status()).toBe(202);
      await expect(page.getByText('Búsqueda completada.', { exact: true })).toBeVisible({ timeout: 150_000 });
      await expect(inbox).toHaveAttribute('aria-busy', 'false');
      const title = (await inbox.getByRole('article').getByRole('heading').allTextContents()).find((value) => !existing.has(value));
      expect(title, 'The test site needs at least one newly discovered opportunity').toBeTruthy();
      const card = inbox.getByRole('article').filter({ has: page.getByRole('heading', { name: title!, exact: true }) });
      await card.getByRole('button', { name: 'Redactar respuesta' }).click();
      await expect(card.getByLabel('Borrador de respuesta')).not.toHaveValue('', { timeout: 60_000 });
      await card.getByRole('button', { name: 'Marcar como respondida' }).click();
      await expect(card).toHaveCount(0);
      await page.reload();
      await expect(inbox).toHaveAttribute('aria-busy', 'false');
      await inbox.getByRole('button', { name: /^Respondidas/ }).click();
      await expect(card.getByLabel('Borrador de respuesta')).toBeVisible();
      await card.getByRole('button', { name: 'Volver a pendientes' }).click();
      await expect(card).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
