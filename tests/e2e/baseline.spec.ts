import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('engineering shell is available at representative viewport sizes', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Secure Exchange' })).toBeVisible();
  await expect(page.getByText('Engineering baseline only.')).toBeVisible();

  const health = await page.request.get('/health');
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toEqual({
    service: 'secure-exchange',
    status: 'ok',
    baseline: '0.2',
  });
});

test('@a11y engineering shell has no detectable WCAG A/AA violations', async ({
  page,
}) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});
