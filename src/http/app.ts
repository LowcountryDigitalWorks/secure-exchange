import { Hono } from 'hono';

import { getEngineeringStatus } from '../application/status.js';
import { renderEngineeringShell, shellStyles } from '../web/page.js';

const securityHeaders = {
  'Content-Security-Policy':
    "default-src 'none'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} as const;

export const app = new Hono();

app.use('*', async (context, next) => {
  await next();

  for (const [name, value] of Object.entries(securityHeaders)) {
    context.header(name, value);
  }
});

app.get('/health', (context) => context.json(getEngineeringStatus()));

app.get('/styles.css', (context) => {
  context.header('Content-Type', 'text/css; charset=utf-8');
  return context.body(shellStyles);
});

app.get('/', (context) =>
  context.html(renderEngineeringShell(getEngineeringStatus())),
);

app.notFound((context) => context.json({ error: 'not_found' }, 404));
