import { db } from '../../lib/api';

// Search engines find every public work, creator and episode from here (samples, drafts and hidden works are left out).
export const dynamic = 'force-dynamic';
const xml = (v: unknown) => String(v ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
const day = (t: unknown) => new Date(Number(t) || Date.now()).toISOString().slice(0, 10);

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const urls: { loc: string; lastmod?: string }[] = [{ loc: `${origin}/` }, { loc: `${origin}/terms` }, { loc: `${origin}/privacy` }];
  try {
    const live = "p.deleted_at IS NULL AND p.hidden_at IS NULL AND p.visibility='public' AND p.source!='sample'";
    const [works, creators, entries] = await db().batch<Record<string, unknown>>([
      db().prepare(`SELECT p.id,MAX(p.created,COALESCE((SELECT MAX(published_at) FROM entries e WHERE e.project_id=p.id AND e.status='published' AND e.published_at<=?),0)) AS updated FROM projects p WHERE ${live} ORDER BY p.created DESC LIMIT 20000`).bind(Date.now()),
      db().prepare(`SELECT u.public_id,MAX(p.created) AS updated FROM profiles u JOIN projects p ON p.owner_id=u.id WHERE u.suspended=0 AND ${live} GROUP BY u.public_id LIMIT 10000`),
      db().prepare(`SELECT e.id,e.project_id,e.published_at FROM entries e JOIN projects p ON p.id=e.project_id WHERE ${live} AND e.status='published' AND e.published_at<=? ORDER BY e.published_at DESC LIMIT 20000`).bind(Date.now()),
    ]);
    for (const w of works.results) urls.push({ loc: `${origin}/works/${encodeURIComponent(String(w.id))}`, lastmod: day(w.updated) });
    for (const c of creators.results) urls.push({ loc: `${origin}/creators/${encodeURIComponent(String(c.public_id))}`, lastmod: day(c.updated) });
    for (const e of entries.results) urls.push({ loc: `${origin}/works/${encodeURIComponent(String(e.project_id))}/e/${encodeURIComponent(String(e.id))}`, lastmod: day(e.published_at) });
  } catch {} // the static pages are still worth listing if the database is unavailable
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.slice(0, 50000).map(u => `<url><loc>${xml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
