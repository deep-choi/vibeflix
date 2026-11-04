import html from './design-system.html?raw';
import { SECURITY_HEADERS, versionAssets } from '../../lib/security';

// Living component gallery for the design system (docs/DESIGN_SYSTEM.md). Served here rather than from public/
// so its /ds.css and /ds.js links carry the build version like every other page.
const page = versionAssets(html);
export const dynamic = 'force-dynamic';
export function GET() {
  return new Response(page, {
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' },
  });
}
