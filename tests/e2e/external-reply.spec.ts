import { once } from "node:events";

import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { serve } from "@hono/node-server";

import { EXTERNAL_RETRIEVAL_ROUTE_PREFIX } from "../../src/http/external-retrieval-development.js";
import {
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
  if (!server.listening) await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Synthetic external reply server did not expose a TCP port.");
  }
  const baseURL = `http://127.0.0.1:${address.port}`;
  try {
    return await run(baseURL, fixture);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }
}

async function present(
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

test("external reply route remains disabled on the default demo server", async ({
  page,
}) => {
  const response = await page.goto(`${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/reply`);
  expect(response?.status()).toBe(404);
});

test("@a11y mixed read/reply capability submits by safe POST/Redirect/GET", async ({
  page,
}) => {
  await withExternalServer(async (baseURL, fixture) => {
    const { threadId } = await createSyntheticThread(fixture);
    const grant = await issueGrant(fixture, threadId, [
      "THREAD_READ",
      "THREAD_REPLY",
    ]);
    const requestedUrls: string[] = [];
    page.on("request", (request) => requestedUrls.push(request.url()));

    await present(page, baseURL, grant);
    await page.getByRole("link", { name: "Send reply" }).click();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    const body = "Synthetic browser external reply.";
    await page.getByLabel("Synthetic plain-text reply").fill(body);
    await page.getByRole("button", { name: "Send synthetic reply" }).click();
    await expect(
      page.getByRole("heading", { name: "Synthetic reply submitted" }),
    ).toBeVisible();
    expect(page.url()).toBe(
      `${baseURL}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/reply/sent`,
    );
    expect(requestedUrls.some((url) => url.includes(grant.secret))).toBe(false);
    expect(requestedUrls.some((url) => url.includes(body))).toBe(false);

    await page.getByRole("link", { name: "Return to secure access" }).click();
    await page.getByRole("link", { name: "Read conversation" }).click();
    await expect(page.getByText(body)).toBeVisible();
  });
});

test("reply-only browser capability replies without gaining conversation read", async ({
  page,
}) => {
  await withExternalServer(async (baseURL, fixture) => {
    const { threadId } = await createSyntheticThread(fixture);
    const grant = await issueGrant(fixture, threadId, ["THREAD_REPLY"]);
    await present(page, baseURL, grant);
    await expect(page.getByRole("link", { name: "Send reply" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Read conversation" }),
    ).toHaveCount(0);

    const readResponse = await page.goto(
      `${baseURL}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/conversation`,
    );
    expect(readResponse?.status()).toBe(403);

    await page.goto(`${baseURL}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/reply`);
    await page
      .getByLabel("Synthetic plain-text reply")
      .fill("Reply-only browser message.");
    await page.getByRole("button", { name: "Send synthetic reply" }).click();
    await expect(
      page.getByRole("heading", { name: "Synthetic reply submitted" }),
    ).toBeVisible();
  });
});