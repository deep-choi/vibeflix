import html from './admin.html?raw';
import { ADMIN_HEADERS, versionAssets } from '../../lib/security';

// The page itself is public markup; every action goes through /api/admin, which requires an admin session.
const page = versionAssets(html);
export const dynamic = 'force-dynamic';
export function GET() {
  return new Response(page, {
    headers: {
      ...ADMIN_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'same-origin',
    },
  });
}
