import { Buffer } from "node:buffer";

import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SYNTHETIC_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2xQAAAAASUVORK5CYII=",
  "base64",
);

async function expectNoOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

async function expectNoA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function submitSyntheticCommercialIntake(page: Page): Promise<void> {
  await page.goto("/demo/commercial");
  await expect(
    page.getByRole("heading", {
      name: "Synthetic provider-augmented records intake",
    }),
  ).toBeVisible();
  await expect(page.getByText("SYNTHETIC DEVELOPMENT DEMO").first()).toBeVisible();
  await page.getByLabel("Routing category").selectOption("RECORDS");
  await page
    .getByLabel("Synthetic message")
    .fill("Synthetic commercial workflow browser record.");
  await page.getByLabel("Synthetic name").fill("Synthetic Avery Example");
  await page.getByLabel("Synthetic date of birth").fill("1985-01-02");
  await page.getByLabel("Synthetic attachments").setInputFiles({
    name: "synthetic-image.png",
    mimeType: "image/png",
    buffer: SYNTHETIC_PNG,
  });
  await page.getByRole("button", { name: "Submit synthetic records" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic records received" }),
  ).toBeVisible();
}

async function openSyntheticCommercialThread(page: Page): Promise<void> {
  await page
    .getByRole("link", { name: "Open synthetic staff queue" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Synthetic commercial staff queue" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open synthetic work item" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Synthetic commercial work item" }),
  ).toBeVisible();
}

test("synthetic commercial demo completes the provider-augmented browser workflow", async ({
  page,
}) => {
  await submitSyntheticCommercialIntake(page);
  await openSyntheticCommercialThread(page);

  await page.getByLabel("Known synthetic patient number").fill("DEMO-1001");
  await page
    .getByRole("button", { name: "Verify synthetic number" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Synthetic fixture candidates" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm this synthetic patient" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirmed synthetic patient" }),
  ).toBeVisible();

  const preview = page.getByRole("img", { name: "Synthetic attachment preview" });
  await expect(preview).toBeVisible();
  expect(
    await preview.evaluate((image) => (image as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);

  await page.getByLabel("Destination/category").selectOption("PATIENT_DOCUMENTS");
  await page.getByLabel("Classification").selectOption("DOCUMENT");
  await page.getByRole("button", { name: "Save / confirm mapping" }).click();
  await expect(page.getByText("Synthetic patient documents")).toBeVisible();

  await page.getByRole("button", { name: "SIMULATED FAILURE" }).click();
  await expect(page.getByText("SIMULATED / SYNTHETIC FAILURE")).toBeVisible();
  await page
    .getByRole("button", { name: "SIMULATED SUCCESS / RETRY" })
    .click();
  await expect(page.getByText("SIMULATED / SYNTHETIC SUCCESS")).toBeVisible();
  await page.getByRole("button", { name: "Confirm simulated filing" }).click();
  await expect(
    page.getByText(/Existing FILED TransferAttestation recorded:/u),
  ).toBeVisible();

  await page.getByRole("button", { name: "Complete exchange" }).click();
  await expect(page.getByText("Current lifecycle: COMPLETED")).toBeVisible();
  await page
    .getByRole("button", { name: "Dispose temporary exchange" })
    .click();
  await expect(page.getByText("Current lifecycle: DISPOSED")).toBeVisible();
  await expectNoOverflow(page);
});

test("@a11y synthetic commercial intake, queue, work item, and diagnostics are WCAG A/AA clean and responsive", async ({
  page,
}) => {
  await page.goto("/demo/commercial");
  await expectNoA11yViolations(page);
  await expectNoOverflow(page);

  await page.getByLabel("Routing category").selectOption("RECORDS");
  await page.getByLabel("Synthetic message").fill("Synthetic accessibility record.");
  await page.getByLabel("Synthetic attachments").setInputFiles({
    name: "synthetic-image.png",
    mimeType: "image/png",
    buffer: SYNTHETIC_PNG,
  });
  await page.getByRole("button", { name: "Submit synthetic records" }).click();
  await page
    .getByRole("link", { name: "Open synthetic staff queue" })
    .click();
  await expectNoA11yViolations(page);
  await expectNoOverflow(page);

  await page
    .getByRole("button", { name: "Open synthetic work item" })
    .first()
    .click();
  await expectNoA11yViolations(page);
  await expectNoOverflow(page);

  await page
    .getByRole("link", { name: "Sanitized diagnostics" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sanitized local diagnostics" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await expectNoOverflow(page);
});
