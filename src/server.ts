import { serve } from "@hono/node-server";

import { app } from "./http/app.js";

const DEFAULT_PORT = 3000;
const parsedPort = Number.parseInt(
  process.env["PORT"] ?? String(DEFAULT_PORT),
  10,
);

if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

serve({
  fetch: app.fetch,
  port: parsedPort,
});

console.log(
  `Secure Exchange engineering shell listening on port ${parsedPort}.`,
);
