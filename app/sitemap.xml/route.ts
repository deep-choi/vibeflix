import { db } from '../../lib/api';
import { catalogGen } from '../../lib/projects';

// Search engines find every public work, creator, episode and community post from here (samples, drafts and hidden works are left out).
export const dynamic = 'force-dynamic';
const xml = (v: unknown) => String(v ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
const day = (t: unknown) => new Date(Number(t) || Date.now()).toISOString().slice(0, 10);

// Crawlers ask for this often and it reads every public work and episode, so each Worker isolate keeps it up to
// 10 minutes — less when a work is added or changed in this isolate (catalogGen).
let cached: { origin: string; at: number; gen: number; body: string } | null = null;
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  if (cached && cached.origin === origin && cached.gen === catalogGen() && Date.now() - cached.at < 600_000) return new Response(cached.body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  const urls: { loc: string; lastmod?: string }[] = [{ loc: `${origin}/` }, { loc: `${origin}/terms` }, { loc: `${origin}/privacy` }];
  let complete = false;
  try {
    const live = "p.deleted_at IS NULL AND p.hidden_at IS NULL AND p.visibility='public' AND p.source!='sample'";
    const [works, creators, entries, posts] = await db().batch<Record<string, unknown>>([
      db().prepare(`SELECT p.id,MAX(p.created,COALESCE((SELECT MAX(published_at) FROM entries e WHERE e.project_id=p.id AND e.status='published' AND e.published_at<=?),0)) AS updated FROM projects p WHERE ${live} ORDER BY p.created DESC LIMIT 20000`).bind(Date.now()),
      db().prepare(`SELECT u.public_id,MAX(p.created) AS updated FROM profiles u JOIN projects p ON p.owner_id=u.id WHERE u.suspended=0 AND ${live} GROUP BY u.public_id LIMIT 10000`),
      db().prepare(`SELECT e.id,e.project_id,e.published_at FROM entries e JOIN projects p ON p.id=e.project_id WHERE ${live} AND e.status='published' AND e.published_at<=? ORDER BY e.published_at DESC LIMIT 20000`).bind(Date.now()),
      db().prepare('SELECT p.id,p.updated FROM posts p JOIN profiles u ON u.id=p.owner_id WHERE p.deleted_at IS NULL AND p.hidden_at IS NULL AND u.suspended=0 ORDER BY p.updated DESC LIMIT 20000'),
    ]);
    for (const w of works.results) urls.push({ loc: `${origin}/works/${encodeURIComponent(String(w.id))}`, lastmod: day(w.updated) });
    for (const c of creators.results) urls.push({ loc: `${origin}/creators/${encodeURIComponent(String(c.public_id))}`, lastmod: day(c.updated) });
    complete = true;
    for (const e of entries.results) urls.push({ loc: `${origin}/works/${encodeURIComponent(String(e.project_id))}/e/${encodeURIComponent(String(e.id))}`, lastmod: day(e.published_at) });
    for (const p of posts.results) urls.push({ loc: `${origin}/posts/${encodeURIComponent(String(p.id))}`, lastmod: day(p.updated) });
  } catch {} // the static pages are still worth listing if the database is unavailable
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.slice(0, 50000).map(u => `<url><loc>${xml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
  if (complete) cached = { origin, at: Date.now(), gen: catalogGen(), body }; // never keep the database-down fallback
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
}
