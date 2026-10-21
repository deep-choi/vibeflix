import html from './admin.html?raw';

// The page itself is public markup; every action goes through /api/admin, which requires an admin session.
export const dynamic = 'force-dynamic';
export function GET() {
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'same-origin',
    },
  });
}
