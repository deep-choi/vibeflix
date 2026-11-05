import { waitUntil } from 'cloudflare:workers';
import html from './site.html?raw';
import { recordVisit } from '../lib/admin';
import { SECURITY_HEADERS, versionAssets } from '../lib/security';

const page = versionAssets(html);
export const dynamic = 'force-dynamic';
// Addresses from before these became pages (shared links, sign-in returns)
function oldAddress(url: URL) {
  const q = url.searchParams, id = (name: string) => encodeURIComponent(q.get(name) || '');
  if (q.get('post')) return `/posts/${id('post')}`;
  if (q.get('project')) return `/works/${id('project')}`;
  if (q.get('write') === '1') return '/posts/new';
  if (q.get('upload') === '1') return '/works/new';
  if (q.has('account-deletion')) return '/account#settings';
  return '';
}
export async function GET(request: Request) {
  const moved = oldAddress(new URL(request.url));
  if (moved) return new Response(null, { status: 302, headers: { Location: moved, 'Cache-Control': 'no-store' } });
  // counting the visit never delays the page
  waitUntil(recordVisit(request));
  return new Response(page, {
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
