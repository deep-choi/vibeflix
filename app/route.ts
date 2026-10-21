import html from './site.html?raw';
import { recordVisit } from '../lib/admin';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  await recordVisit(request);
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}
