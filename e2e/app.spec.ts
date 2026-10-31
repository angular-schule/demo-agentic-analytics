import { expect, type Page, test } from '@playwright/test';

const FAKE_LLM = process.env['FAKE_LLM_URL'] ?? 'http://127.0.0.1:4000';

async function ask(page: Page, question: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Ask about sales, products or regions …' });
  await input.fill(question);
  await input.press('Enter');
}

async function modelRequests(page: Page): Promise<number> {
  const response = await page.request.get(`${FAKE_LLM}/requests`);
  return ((await response.json()) as unknown[]).length;
}

const chat = (page: Page) => page.locator('app-chat-panel');
const dashboard = (page: Page) => page.locator('app-dashboard');
const traffic = (page: Page) => page.locator('app-traffic-panel');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('the header names backend, agent and model', async ({ page }) => {
  const backends = { node: 'NestJS · PostgreSQL', dotnet: 'ASP.NET Core · SQL Server' } as const;
  const health = (await (await page.request.get('/api/health')).json()) as { backend: keyof typeof backends };
  const agent = (await (await page.request.get('/agent/info')).json()) as { framework: string; model: string };
  const status = page.getByRole('list', { name: 'Status' });
  await expect(status).toContainText(backends[health.backend]);
  await expect(status).toContainText(`${agent.framework} · ${agent.model}`);
  await expect(status).toContainText('No personal data');
});

test('a question becomes a chart, and the agent comments on it', async ({ page }) => {
  await ask(page, 'Revenue per year, please');
  await expect(chat(page).getByRole('heading', { name: 'Revenue per year' })).toBeVisible();
  await expect(chat(page).getByRole('img', { name: /Line chart of revenue/ })).toBeVisible();
  await expect(chat(page)).toContainText('The querySales result is shown above.');
});

test('a pinned chart stays on the dashboard and reloads without the model', async ({ page }) => {
  await ask(page, 'Revenue per year, please');
  await chat(page).getByRole('button', { name: 'Pin to dashboard' }).click();
  await expect(dashboard(page).getByRole('heading', { name: 'Revenue per year' })).toBeVisible();

  const before = await modelRequests(page);
  await page.reload();
  await expect(dashboard(page).getByRole('img', { name: /Line chart of revenue/ })).toBeVisible();
  expect(await modelRequests(page)).toBe(before);
});

test('the agent pins a chart through the frontend tool', async ({ page }) => {
  await ask(page, 'Please pin it');
  await expect(dashboard(page).getByRole('heading', { name: 'Revenue per year' })).toBeVisible();
  await expect(chat(page)).toContainText('The pinToDashboard result is shown above.');
});

test('the product search shows cards with photos', async ({ page }) => {
  await ask(page, 'What does the Mountain bike look like?');
  const photo = chat(page).getByRole('img', { name: /Mountain-200/ }).first();
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test('a request outside the semantic layer is explained, not drawn', async ({ page }) => {
  await ask(page, 'Show me the salary of every employee');
  await expect(chat(page)).toContainText(/revenue/);
  await expect(chat(page).getByRole('img', { name: /chart/ })).toHaveCount(0);
});

test('the traffic window shows both connections', async ({ page }) => {
  await expect(traffic(page)).toContainText('Debug feature, not for production');
  await ask(page, 'Revenue per year, please');
  await expect(chat(page)).toContainText('The querySales result is shown above.');

  await expect(traffic(page).getByRole('button', { name: /POST \/agent\/ag-ui\/analyst 200/ })).toBeVisible();
  await expect(traffic(page)).toContainText('TOOL_CALL_RESULT');
  await expect(traffic(page)).toContainText('RUN_FINISHED');

  await traffic(page).getByRole('tab', { name: /LLM provider/ }).click();
  await expect(traffic(page).getByRole('button', { name: /\/v1\/messages 200/ }).first()).toBeVisible();
  await expect(traffic(page)).toContainText('message_stop');
  await expect(traffic(page)).not.toContainText('test-key');
});

test('without DEBUG_TRAFFIC the window is gone', async ({ page }) => {
  await page.route('**/agent/info', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), debugTraffic: false } });
  });
  await page.reload();
  await expect(page.getByRole('list', { name: 'Status' })).toContainText('anthropic/claude-sonnet-5-5');
  await expect(traffic(page)).toHaveCount(0);
});
