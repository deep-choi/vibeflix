import { waitUntil } from 'cloudflare:workers';
import html from './site.html?raw';
import { recordVisit } from '../lib/admin';
import { SECURITY_HEADERS, versionAssets } from '../lib/security';

const page = versionAssets(html);
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  // counting the visit never delays the page
  waitUntil(recordVisit(request));
  return new Response(page, {
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
