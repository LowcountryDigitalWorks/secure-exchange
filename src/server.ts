import { serve } from "@hono/node-server";

import { createApp } from "./http/app.js";
import { createLocalDevelopmentDemoRuntime } from "./http/development-demo.js";

const DEFAULT_PORT = 3000;
const parsedPort = Number.parseInt(
  process.env["PORT"] ?? String(DEFAULT_PORT),
  10,
);

if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const demoEnabled = process.env["SECURE_EXCHANGE_SYNTHETIC_DEMO"] === "enabled";
const externalRetrievalEnabled =
  demoEnabled && process.env["DEMO_EXTERNAL_RETRIEVAL_ENABLED"] === "enabled";
const app = createApp({
  ...(demoEnabled ? { demo: createLocalDevelopmentDemoRuntime() } : {}),
  ...(externalRetrievalEnabled ? { externalRetrievalEnabled: true } : {}),
});

serve({
  fetch: app.fetch,
  port: parsedPort,
});

console.log(
  `Secure Exchange local development server listening on port ${parsedPort}; synthetic demo ${demoEnabled ? "enabled" : "disabled"}; external retrieval development slice ${externalRetrievalEnabled ? "enabled" : "disabled"}.`,
);
