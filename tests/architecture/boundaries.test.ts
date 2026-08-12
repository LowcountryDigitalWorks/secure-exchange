import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(testDirectory, "../../src");

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listTypeScriptFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

const providerOrDeliveryImports = [
  /from\s+['"]hono(?:\/|['"])/u,
  /from\s+['"]@hono\//u,
  /from\s+['"]@aws-sdk\//u,
  /from\s+['"]node:/u,
];

const browserRuntimeReferences =
  /\b(?:window|document|navigator|localStorage|sessionStorage)\b/u;

async function expectPortableLayer(
  layer: "domain" | "application",
): Promise<void> {
  const files = await listTypeScriptFiles(path.join(sourceRoot, layer));

  for (const file of files) {
    const source = await readFile(file, "utf8");

    for (const forbidden of providerOrDeliveryImports) {
      expect(
        source,
        `${file} contains provider/delivery import ${forbidden}`,
      ).not.toMatch(forbidden);
    }

    expect(source, `${file} contains a browser runtime reference`).not.toMatch(
      browserRuntimeReferences,
    );
  }
}

describe("architecture boundaries", () => {
  it("keeps the domain independent of frameworks, providers, Node, and browsers", async () => {
    await expectPortableLayer("domain");
  });

  it("keeps application use cases independent of delivery/providers and browsers", async () => {
    await expectPortableLayer("application");
  });
});
