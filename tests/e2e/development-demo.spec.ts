import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("synthetic development demo completes the browser vertical slice", async ({
  page,
}) => {
  await page.goto("/demo/external");
  await expect(
    page.getByRole("heading", { name: "External synthetic exchange" }),
  ).toBeVisible();
  await page.getByLabel("Routing category").selectOption("GENERAL");
  await page
    .getByLabel("Synthetic message")
    .fill("Synthetic browser vertical-slice message.");
  await page.getByRole("button", { name: "Submit synthetic exchange" }).click();

  await expect(
    page.getByRole("heading", { name: "Synthetic submission received" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open synthetic staff queue" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic Intake Queue" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open conversation" }).first().click();

  await expect(
    page.getByRole("heading", { name: "Conversation" }),
  ).toBeVisible();
  await expect(page.getByText("External → Staff").first()).toBeVisible();
  await page
    .getByLabel("Synthetic reply")
    .fill("Synthetic staff browser reply.");
  await page
    .getByRole("button", { name: "Send synthetic staff reply" })
    .click();

  await expect(page.getByText("Staff → External").last()).toBeVisible();
  await expect(page.getByText("Synthetic staff browser reply.")).toBeVisible();
});

test("@a11y synthetic external and staff queue pages have no detectable WCAG A/AA violations", async ({
  page,
}) => {
  await page.goto("/demo/external");
  let results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  await page.goto("/demo/staff/queue");
  results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
