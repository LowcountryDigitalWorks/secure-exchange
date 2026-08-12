import { describe, expect, it } from "vitest";

import { app } from "../../src/http/app.js";

describe("HTTP engineering shell", () => {
  it("returns a minimal health response", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "secure-exchange",
      status: "ok",
      baseline: "0.5",
    });
  });

  it("renders a non-feature shell with the synthetic demo disabled by default", async () => {
    const response = await app.request("/");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "form-action 'none'",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(body).toContain('<h1 id="page-title">Secure Exchange</h1>');
    expect(body).toContain("Synthetic Development Demo is disabled.");
  });

  it("does not expose development routes from the default app", async () => {
    const response = await app.request("/demo/external");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });

  it("returns a generic 404 response", async () => {
    const response = await app.request("/does-not-exist");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });
});
