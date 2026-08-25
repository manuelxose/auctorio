import { test, expect, type APIRequestContext } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';

let api: APIRequestContext;

type InstallationView = {
  id: string;
  kind: string;
  provider: string;
  state: string;
  displayName: string | null;
  discovered: Record<string, unknown> | null;
  hasCredentials: boolean;
  verifiedAt: string | null;
  lastError: string | null;
  siteId: string | null;
};

type OperationView = {
  id: string;
  status: string;
  errorSummary: string | null;
  retryCount: number;
  metadata: Record<string, unknown> | null;
};

test.beforeAll(async ({ playwright }) => {
  expect(EMAIL, 'E2E_EMAIL required').toBeTruthy();
  expect(PASSWORD, 'E2E_PASSWORD required').toBeTruthy();
  api = await playwright.request.newContext({
    baseURL: process.env.E2E_BASE_URL || 'https://auctorio.com',
  });
  const login = await api.post('/studio/api/auth/login/password', {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(login.status()).toBe(200);
});

test.afterAll(async () => {
  await api?.dispose();
});

async function pollOperation(operationId: string, timeoutMs = 120_000): Promise<OperationView> {
  const deadline = Date.now() + timeoutMs;
  let last: OperationView | null = null;
  while (Date.now() < deadline) {
    const response = await api.get(`/studio/api/backend/v2/operations/${operationId}`);
    expect(response.status()).toBe(200);
    last = (await response.json()) as OperationView;
    if (['succeeded', 'failed', 'partial', 'cancelled'].includes(last.status)) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`operation ${operationId} did not finish in time (last: ${JSON.stringify(last)})`);
}

test('golden path 1: connector metadata has no hard-coded brands and the workspace shows no seeded brand connections', async () => {
  const capabilities = await api.get('/studio/api/backend/v2/connectors/capabilities');
  expect(capabilities.status()).toBe(200);
  const body = (await capabilities.json()) as { kinds: Array<{ kind: string }> };
  const kinds = body.kinds.map((entry) => entry.kind);
  expect(kinds).toEqual(['website', 'instagram', 'x']);

  // Capability metadata must be provider-driven — no brand references.
  expect(JSON.stringify(body)).not.toMatch(/tecnoria|guiatv|talkaris/i);

  const installations = await api.get('/studio/api/backend/v2/connector-installations');
  expect(installations.status()).toBe(200);
  const installItems = ((await installations.json()) as { items: Array<{ displayName: string | null }> }).items;
  expect(installItems.some((item) => /tecnoria|guiatv/i.test(item.displayName ?? ''))).toBe(false);

  // Social setup reports honestly whether a provider is configured.
  const setup = await api.get('/studio/api/backend/v2/social-connections/setup');
  expect(setup.status()).toBe(200);
  const setupBody = (await setup.json()) as { provider: { configured: boolean } };
  expect(typeof setupBody.provider.configured).toBe('boolean');
});

test('golden path 2: website discovery → authentication → reversible verification → activation', async () => {
  // 1. Discovery (synchronous, SSRF-safe).
  const discovery = await api.post('/studio/api/backend/v2/connectors/discover-website', {
    data: { url: 'example.com' },
  });
  expect(discovery.status()).toBe(200);
  const discoveryBody = (await discovery.json()) as { canonicalOrigin: string; reachable: boolean };
  expect(discoveryBody.canonicalOrigin).toBe('https://example.com');
  expect(discoveryBody.reachable).toBe(true);

  // Blocked targets must be rejected.
  const blocked = await api.post('/studio/api/backend/v2/connectors/discover-website', {
    data: { url: 'http://169.254.169.254/latest/meta-data' },
  });
  expect(blocked.status()).toBe(400);

  // 2. Create a signed-webhook installation (deterministic external echo endpoint).
  const created = await api.post('/studio/api/backend/v2/connector-installations', {
    data: { kind: 'website', provider: 'generic_webhook', displayName: 'E2E Webhook Target' },
  });
  expect(created.status()).toBe(201);
  const installation = (await created.json()) as InstallationView;
  expect(installation.state).toBe('draft');

  // 3. Background discovery through the queue (produces a durable operation).
  const discoverResponse = await api.post(`/studio/api/backend/v2/connector-installations/${installation.id}/discover`, {
    data: { url: 'https://example.com' },
  });
  expect(discoverResponse.status()).toBe(202);
  const discoverBody = (await discoverResponse.json()) as { operationId: string };
  const discoverOperation = await pollOperation(discoverBody.operationId);
  expect(['succeeded', 'failed']).toContain(discoverOperation.status);

  const afterDiscover = await api.get(`/studio/api/backend/v2/connector-installations/${installation.id}`);
  expect((afterDiscover.status())).toBe(200);
  const discoveredInstallation = ((await afterDiscover.json()) as { installation: InstallationView }).installation;
  expect(discoveredInstallation.state).toBe('credentials_required');
  expect(((discoveredInstallation.discovered ?? {}) as { canonicalOrigin?: string }).canonicalOrigin).toBe('https://example.com');

  // 4. Write-only credentials (never echoed back).
  const credentials = await api.post(`/studio/api/backend/v2/connector-installations/${installation.id}/credentials`, {
    data: {
      secrets: { signingSecret: 'e2e-sandbox-signing-secret' },
      config: { baseUrl: 'https://httpbin.org/post' },
    },
  });
  expect(credentials.status()).toBe(200);
  const credentialsBody = (await credentials.json()) as InstallationView;
  expect(credentialsBody.hasCredentials).toBe(true);
  expect(JSON.stringify(credentialsBody)).not.toContain('e2e-sandbox-signing-secret');

  // 5. Reversible verification (sandbox probe only, never publishes).
  const verifyResponse = await api.post(`/studio/api/backend/v2/connector-installations/${installation.id}/verify`, {});
  expect(verifyResponse.status()).toBe(202);
  const verifyBody = (await verifyResponse.json()) as { operationId: string };
  const verifyOperation = await pollOperation(verifyBody.operationId);
  expect(verifyOperation.status).toBe('succeeded');

  const afterVerify = await api.get(`/studio/api/backend/v2/connector-installations/${installation.id}`);
  const verifiedInstallation = ((await afterVerify.json()) as { installation: InstallationView }).installation;
  expect(verifiedInstallation.state).toBe('ready');
  expect(verifiedInstallation.verifiedAt).toBeTruthy();

  // 6. Activation creates a publishable site behind the installation.
  const activate = await api.post(`/studio/api/backend/v2/connector-installations/${installation.id}/activate`, {});
  expect(activate.status()).toBe(200);
  const activeInstallation = (await activate.json()) as InstallationView;
  expect(activeInstallation.state).toBe('active');
  expect(activeInstallation.siteId).toBeTruthy();
});

test('golden path 3-4: failed verification creates a failed operation with an actionable error; corrected credentials reach success', async () => {
  // Force a connection failure: a port that refuses connections is retryable.
  const created = await api.post('/studio/api/backend/v2/connector-installations', {
    data: { kind: 'website', provider: 'generic_webhook', displayName: 'E2E Flaky Target' },
  });
  expect(created.status()).toBe(201);
  const installation = (await created.json()) as InstallationView;

  const discovery = await api.post(`/studio/api/backend/v2/connector-installations/${installation.id}/discover`, {
    data: { url: 'https://example.com' },
  });
  expect(discovery.status()).toBe(202);
  const discoveryBody = (await discovery.json()) as { operationId: string };
  await pollOperation(discoveryBody.operationId);

  const credentials = await api.post(`/studio/api/backend/v2/connector-installations/${installation.id}/credentials`, {
    data: {
      secrets: { signingSecret: 'e2e-sandbox-signing-secret' },
      config: { baseUrl: 'https://example.com:81/webhook' },
    },
  });
  expect(credentials.status()).toBe(200);

  const verify = await api.post(`/studio/api/backend/v2/connector-installations/${installation.id}/verify`, {});
  expect(verify.status()).toBe(202);
  const verifyBody = (await verify.json()) as { operationId: string };
  const failedOperation = await pollOperation(verifyBody.operationId);
  expect(failedOperation.status).toBe('failed');
  expect(failedOperation.errorSummary).toBeTruthy();

  // The failure surfaces in the activity list.
  const list = await api.get('/studio/api/backend/v2/operations?status=failed&page=1&pageSize=50');
  expect(list.status()).toBe(200);
  const items = ((await list.json()) as { items: OperationView[] }).items;
  expect(items.some((item) => item.id === verifyBody.operationId)).toBe(true);

  // Retry is available for retryable failures.
  const retry = await api.post(`/studio/api/backend/v2/operations/${verifyBody.operationId}/retry`, {});
  expect([200, 409]).toContain(retry.status());

  // Fix the destination and verify again — the same installation reaches ready.
  await api.post(`/studio/api/backend/v2/connector-installations/${installation.id}/credentials`, {
    data: {
      secrets: { signingSecret: 'e2e-sandbox-signing-secret' },
      config: { baseUrl: 'https://httpbin.org/post' },
    },
  });
  const verifyAgain = await api.post(`/studio/api/backend/v2/connector-installations/${installation.id}/verify`, {});
  expect(verifyAgain.status()).toBe(202);
  const verifyAgainBody = (await verifyAgain.json()) as { operationId: string };
  const recoveredOperation = await pollOperation(verifyAgainBody.operationId);
  expect(recoveredOperation.status).toBe('succeeded');

  const afterVerify = await api.get(`/studio/api/backend/v2/connector-installations/${installation.id}`);
  expect(((await afterVerify.json()) as { installation: InstallationView }).installation.state).toBe('ready');

  // Cancel leaves the workspace clean (ready → cancelled).
  const cancel = await api.post(`/studio/api/backend/v2/connector-installations/${installation.id}/cancel`, {});
  expect(cancel.status()).toBe(200);
});

test('golden path 5: social connectors behave honestly without provider credentials', async () => {
  const created = await api.post('/studio/api/backend/v2/connector-installations', {
    data: { kind: 'x', provider: 'x_oauth' },
  });
  expect(created.status()).toBe(201);
  const installation = (await created.json()) as InstallationView;

  // Without server-side provider configuration the session is unavailable —
  // an actionable 503, never a dead button in the UI.
  const session = await api.post(`/studio/api/backend/v2/connector-installations/${installation.id}/social-session`, {});
  expect([201, 503]).toContain(session.status());

  // The capability view explains why one-click OAuth is not ready.
  const capabilities = await api.get('/studio/api/backend/v2/connectors/capabilities');
  const body = (await capabilities.json()) as { kinds: Array<{ kind: string; connectors: Array<{ ready: boolean; actionHint: string | null }> }> };
  const x = body.kinds.find((kind) => kind.kind === 'x');
  expect(x).toBeTruthy();
  if (!x!.connectors[0].ready) {
    expect(x!.connectors[0].actionHint).toBeTruthy();
  }

  // Cleanup draft.
  await api.delete(`/studio/api/backend/v2/connector-installations/${installation.id}`);
});

test('golden path 6: operations and notifications are scoped to the active tenant', async () => {
  const operations = await api.get('/studio/api/backend/v2/operations?page=1&pageSize=20');
  expect(operations.status()).toBe(200);
  const operationsBody = (await operations.json()) as { items: Array<{ tenantId: string }> };
  const tenantIds = new Set(operationsBody.items.map((item) => item.tenantId));
  expect(tenantIds.size).toBeLessThanOrEqual(1);

  const notifications = await api.get('/studio/api/backend/v2/notifications?page=1&pageSize=20');
  expect(notifications.status()).toBe(200);
  const notificationsBody = (await notifications.json()) as { items: Array<{ tenantId: string }>; unread: number };
  const notificationTenantIds = new Set(notificationsBody.items.map((item) => item.tenantId));
  expect(notificationTenantIds.size).toBeLessThanOrEqual(1);
  expect(typeof notificationsBody.unread).toBe('number');

  // A foreign operation id must not resolve (IDOR guard).
  const foreign = await api.get('/studio/api/backend/v2/operations/00000000-0000-4000-8000-000000000000');
  expect(foreign.status()).toBe(404);
});
