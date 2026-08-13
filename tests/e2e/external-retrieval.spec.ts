import { once } from "node:events";

import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { serve } from "@hono/node-server";

import {
  EXTERNAL_CAPABILITY_COOKIE_NAME,
  EXTERNAL_RETRIEVAL_ROUTE_PREFIX,
} from "../../src/http/external-retrieval-development.js";
import {
  createCleanAttachment,
  createExternalDemoFixture,
  createSyntheticThread,
  issueGrant,
} from "../helpers/external-demo-fixture.js";

async function withExternalServer<T>(
  run: (
    baseURL: string,
    fixture: ReturnType<typeof createExternalDemoFixture>,
  ) => Promise<T>,
): Promise<T> {
  const fixture = createExternalDemoFixture();
  const server = serve({
    fetch: fixture.app.fetch,
    hostname: "127.0.0.1",
    port: 0,
  });
  if (!server.listening) {
    await once(server, "listening");
  }
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Synthetic external server did not expose a TCP port.");
  }
  const baseURL = `http://127.0.0.1:${address.port}`;
  try {
    return await run(baseURL, fixture);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) {
          resolve();
        } else {
          reject(error);
        }
      });
    });
  }
}

async function presentCredential(
  page: Page,
  baseURL: string,
  grant: {
    readonly threadId: string;
    readonly grantId: string;
    readonly secret: string;
  },
): Promise<void> {
  await page.goto(`${baseURL}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}`);
  await page.getByLabel("Thread reference").fill(grant.threadId);
  await page.getByLabel("Grant reference").fill(grant.grantId);
  await page.getByLabel("Access secret").fill(grant.secret);
  await page.getByRole("button", { name: "Continue secure access" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic secure access" }),
  ).toBeVisible();
}

test("external retrieval browser routes remain disabled on the default demo server", async ({
  page,
}) => {
  const response = await page.goto(EXTERNAL_RETRIEVAL_ROUTE_PREFIX);
  expect(response?.status()).toBe(404);
});

test("@a11y browser credential POST uses an HttpOnly scoped capability and renders message text without secret URLs", async ({
  page,
}) => {
  await withExternalServer(async (baseURL, fixture) => {
    const payload = '<script id="browser-attack">alert(1)</script>';
    const { threadId } = await createSyntheticThread(fixture, payload);
    const grant = await issueGrant(fixture, threadId, ["THREAD_READ"]);
    const requestedUrls: string[] = [];
    page.on("request", (request) => requestedUrls.push(request.url()));

    await presentCredential(page, baseURL, grant);
    expect(page.url()).toBe(
      `${baseURL}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/session`,
    );
    expect(requestedUrls.some((url) => url.includes(grant.secret))).toBe(false);
    expect(await page.locator("body").textContent()).not.toContain(
      grant.secret,
    );

    const cookies = await page
      .context()
      .cookies(`${baseURL}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}`);
    const capability = cookies.find(
      (cookie) => cookie.name === EXTERNAL_CAPABILITY_COOKIE_NAME,
    );
    expect(capability).toMatchObject({
      httpOnly: true,
      sameSite: "Strict",
      path: EXTERNAL_RETRIEVAL_ROUTE_PREFIX,
      secure: false,
    });

    await page.getByRole("link", { name: "Conversation", exact: true }).click();
    await expect(page.getByText(payload)).toBeVisible();
    await expect(page.locator("script#browser-attack")).toHaveCount(0);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole("link", { name: "Access home" }).click();
    await page.getByRole("button", { name: "End secure access" }).click();
    const after = await page.context().cookies(baseURL);
    expect(
      after.some((cookie) => cookie.name === EXTERNAL_CAPABILITY_COOKIE_NAME),
    ).toBe(false);
  });
});

test("browser mixed-operation grant lists a clean attachment and downloads it as an attachment", async ({
  page,
}) => {
  await withExternalServer(async (baseURL, fixture) => {
    const { threadId, messageId } = await createSyntheticThread(fixture);
    const attachment = await createCleanAttachment(
      fixture,
      threadId,
      messageId,
      '../browser "safe".txt',
      new TextEncoder().encode("browser download body"),
    );
    const grant = await issueGrant(fixture, threadId, [
      "THREAD_READ",
      "ATTACHMENT_READ",
    ]);

    await presentCredential(page, baseURL, grant);
    await page.getByRole("link", { name: "Attachments", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: attachment.safeDownloadFilename,
      }),
    ).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download attachment" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(attachment.safeDownloadFilename);

    const events = fixture.runtime.store.listAuditEvents(
      fixture.runtime.deploymentId,
      threadId,
    );
    expect(
      events.filter((event) => event.eventType === "ATTACHMENT_DOWNLOADED"),
    ).toHaveLength(1);
    expect(
      await fixture.runtime.store.listTransferAttestations(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toEqual([]);
  });
});
