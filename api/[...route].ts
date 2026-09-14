/**
 * Vercel Serverless Function — Main API catch-all.
 *
 * Handles all /api/* routes except /api/admin/*.
 * Uses the bundled Hono app from dist/server.mjs.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getD1 } from '../src/lib/db-vercel.js';

// Dynamic import for the bundled server
let app: any = null;

async function getApp() {
  if (!app) {
    const server = await import('../dist/server.mjs');
    app = server.default || server.app;
  }
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Ensure database is initialized
  const db = getD1();
  db.ensureMigrated();

  // Import and run the Hono app
  const honoApp = await getApp();

  // Convert Vercel request to standard Request
  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      const headerValue = Array.isArray(value) ? value.join(', ') : value;
      headers.set(key, headerValue);
    }
  }

  const request = new Request(url.toString(), {
    method: req.method || 'GET',
    headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
  });

  try {
    const response = await honoApp.fetch(request);

    // Set response status and headers
    res.status(response.status);
    response.headers.forEach((value: string, key: string) => {
      res.setHeader(key, value);
    });

    // Send response body
    const body = await response.text();
    res.send(body);
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
