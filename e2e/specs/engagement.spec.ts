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
      const list = inbox.getByRole('region', { name: platform === 'Reddit' ? 'Conversaciones' : 'Preguntas' });
      const detail = inbox.getByRole('region', { name: 'Detalle de la oportunidad' });
      const opportunityTitles = () => list.locator('.opp-item').evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')));
      await expect(inbox).toHaveAttribute('aria-busy', 'false');
      const existing = new Set(await opportunityTitles());
      const search = page.getByRole('button', { name: 'Buscar ahora' });
      await expect(search, 'Search provider and site keywords must be configured').toBeEnabled();
      const operation = page.waitForResponse((response) => response.url().includes('/engagement/refresh') && response.request().method() === 'POST');
      await search.click();
      expect((await operation).status()).toBe(202);
      await expect(page.getByText('Búsqueda completada.', { exact: true })).toBeVisible({ timeout: 150_000 });
      await expect(inbox).toHaveAttribute('aria-busy', 'false');
      const title = (await opportunityTitles()).find((value) => value && !existing.has(value));
      expect(title, 'The test site needs at least one newly discovered opportunity').toBeTruthy();
      const opportunity = list.getByRole('button', { name: title!, exact: true });
      const searchbox = list.getByRole('searchbox', { name: 'Buscar en oportunidades' });
      await searchbox.fill(title!);
      await expect(list.locator('.opp-item')).toHaveCount(1);
      await opportunity.click();
      await searchbox.clear();
      await expect(detail.getByRole('heading', { name: title!, exact: true })).toBeVisible();
      await detail.getByRole('button', { name: 'Redactar respuesta' }).click();
      await expect(detail.getByLabel('Borrador de respuesta')).not.toHaveValue('', { timeout: 60_000 });
      await detail.getByRole('button', { name: 'Marcar como respondida' }).click();
      await expect(opportunity).toHaveCount(0);
      await page.reload();
      await expect(inbox).toHaveAttribute('aria-busy', 'false');
      await list.getByRole('button', { name: 'Respondidas', exact: true }).click();
      await opportunity.click();
      await expect(detail.getByLabel('Borrador de respuesta')).toBeVisible();
      await detail.getByRole('button', { name: 'Volver a pendientes' }).click();
      await expect(opportunity).toHaveCount(0);
      await list.getByRole('button', { name: 'Pendientes', exact: true }).click();
      await opportunity.click();
      await detail.getByRole('button', { name: 'Descartar', exact: true }).click();
      await expect(opportunity).toHaveCount(0);
      await page.reload();
      await page.getByRole('group', { name: 'Resumen de oportunidades' }).getByRole('button', { name: /^Descartadas/ }).click();
      await opportunity.click();
      await expect(detail.getByText('Descartada', { exact: true })).toBeVisible();
      await detail.getByRole('button', { name: 'Volver a pendientes' }).click();
      await expect(opportunity).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
