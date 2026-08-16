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

const dentalSpecificCoreTerms =
  /\b(?:PatNum|patientNumber|dateOfBirth|Open\s+Dental|toothNumber|dentalImage|patientDemographic)\b/iu;
const providerSdkImport =
  /from\s+['"](?:@aws-sdk\/|@google-cloud\/|@microsoft\/|googleapis(?:\/|['"])|zoho|opendental)/iu;

describe("Release 0.14 commercial-demo architecture boundary", () => {
  it("keeps dental-specific identifiers out of generic domain and application source", async () => {
    for (const layer of ["domain", "application"] as const) {
      const files = await listTypeScriptFiles(path.join(sourceRoot, layer));
      for (const file of files) {
        const source = await readFile(file, "utf8");
        expect(
          source,
          `${file} contains dental-specific commercial-demo vocabulary`,
        ).not.toMatch(dentalSpecificCoreTerms);
      }
    }
  });

  it("keeps provider SDKs and network integrations out of the synthetic commercial slice", async () => {
    const files = [
      path.join(sourceRoot, "adapters/synthetic-commercial-workflow.ts"),
      path.join(sourceRoot, "http/commercial-development.ts"),
      path.join(sourceRoot, "web/commercial-development-page.ts"),
    ];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source, `${file} imports a provider SDK`).not.toMatch(
        providerSdkImport,
      );
    }
  });

  it("contains no synthetic or real patient-creation diagnostic/event path", async () => {
    const files = await listTypeScriptFiles(sourceRoot);
    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source).not.toContain("new_patient_created");
    }
  });
});
