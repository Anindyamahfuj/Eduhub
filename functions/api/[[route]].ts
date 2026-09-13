/**
 * Cloudflare Pages Functions entry point.
 *
 * Every /api/* request is handled by the Hono application in src/index.ts.
 * Static assets are served directly by Pages from the build output directory.
 */
import { handle } from 'hono/cloudflare-pages';
import { app } from '../../src/index';

export const onRequest = handle(app);
