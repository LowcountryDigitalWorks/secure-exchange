import { describe, expect, it } from "vitest";

import { app } from "../../src/http/app.js";

describe("HTTP engineering shell", () => {
  it("returns a minimal health response", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "secure-exchange",
      status: "ok",
      baseline: "0.2",
    });
  });

  it("renders a non-feature shell with security headers", async () => {
    const response = await app.request("/");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(body).toContain('<h1 id="page-title">Secure Exchange</h1>');
    expect(body).toContain("Secure messaging workflows are not implemented.");
  });

  it("returns a generic 404 response", async () => {
    const response = await app.request("/does-not-exist");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });
});
