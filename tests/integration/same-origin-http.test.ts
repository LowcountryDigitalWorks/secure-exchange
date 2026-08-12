import { describe, expect, it } from "vitest";

import { createApp } from "../../src/http/app.js";
import { createLocalDevelopmentDemoRuntime } from "../../src/http/development-demo.js";

const ORIGIN = "http://localhost";
const BODY = new URLSearchParams({
  routingCategory: "GENERAL",
  initialMessage: "Synthetic Fetch Metadata submission.",
}).toString();

describe("development mutation same-origin boundary", () => {
  it("accepts browser Fetch Metadata only for same-origin navigation", async () => {
    const runtime = createLocalDevelopmentDemoRuntime();
    const app = createApp({ demo: runtime });

    const response = await app.request(`${ORIGIN}/demo/external`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Sec-Fetch-Site": "same-origin",
      },
      body: BODY,
    });

    expect(response.status).toBe(303);
  });

  it.each(["cross-site", "same-site", "none"])(
    "rejects Fetch Metadata site value %s",
    async (site) => {
      const runtime = createLocalDevelopmentDemoRuntime();
      const app = createApp({ demo: runtime });

      const response = await app.request(`${ORIGIN}/demo/external`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Sec-Fetch-Site": site,
        },
        body: BODY,
      });

      expect(response.status).toBe(403);
    },
  );

  it("rejects a mutation with neither Fetch Metadata nor Origin", async () => {
    const runtime = createLocalDevelopmentDemoRuntime();
    const app = createApp({ demo: runtime });

    const response = await app.request(`${ORIGIN}/demo/external`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: BODY,
    });

    expect(response.status).toBe(403);
  });
});
