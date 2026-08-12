import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("local development shell is available at representative viewport sizes", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Secure Exchange" }),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic Development Demo is enabled for this local process."),
  ).toBeVisible();

  const health = await page.request.get("/health");
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toEqual({
    service: "secure-exchange",
    status: "ok",
    baseline: "0.5",
  });
});

test("@a11y local development shell has no detectable WCAG A/AA violations", async ({
  page,
}) => {
  await page.goto("/");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});
