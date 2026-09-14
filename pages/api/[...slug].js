/**
 * Next.js API Catch-All Handler
 * 
 * This file handles all /api/* routes using the existing Hono app.
 * The original Hono routes are preserved untouched.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { app } from '../../src/index';
import { getD1 } from '../../src/lib/db-vercel';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Ensure database is initialized
  const db = getD1();
  db.ensureMigrated();

  // Convert Next.js request to standard Request
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
    body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
  });

  try {
    const response = await app.fetch(request);

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

export const config = {
  api: {
    bodyParser: false,
  },
};
