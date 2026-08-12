import { rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist", { force: true, recursive: true });

await build({
  entryPoints: ["src/server.ts"],
  bundle: true,
  outfile: "dist/server.js",
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
});
