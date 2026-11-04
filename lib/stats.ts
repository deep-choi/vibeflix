import { db } from './api';
import { kstDay } from './admin';

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;
const human = (request: Request) => { const ua = request.headers.get('user-agent') || ''; return !!ua && !BOT.test(ua) && request.headers.get('purpose') !== 'prefetch'; };

/**
 * Where a view came from, as a short label: a page inside VIBEFLIX, another site's host name (referrers carry
 * only the origin across sites), or "직접 방문" when there is no referrer (typed URL, app, messenger in-app browser).
 */
export function referrerSource(request: Request) {
  const raw = request.headers.get('referer') || '';
  if (!raw) return '직접 방문 · 앱';
  try {
    const ref = new URL(raw); const here = new URL(request.url);
    if (ref.host === here.host) {
      const path = ref.pathname;
      if (path === '/' || path === '') return ref.searchParams.has('project') ? '공유 링크' : 'VIBEFLIX 홈';
      if (path.startsWith('/creators/')) return '크리에이터 페이지';
      if (path.startsWith('/works/')) return '다른 작품·회차';
      return 'VIBEFLIX 안';
    }
    return ref.hostname.replace(/^www\./, '').slice(0, 60) || '알 수 없음';
  } catch { return '알 수 없음'; }
}

/** Counts a detail view (with where it came from) or an outbound link click for a work (per KST day). Never throws. */
export async function countWork(request: Request, projectId: string, kind: 'view' | 'click') {
  try {
    if (!human(request)) return;
    const column = kind === 'view' ? 'views' : 'clicks'; const day = kstDay();
    const statements = [db().prepare(`INSERT INTO work_stats (project_id,day,${column}) VALUES (?,?,1) ON CONFLICT(project_id,day) DO UPDATE SET ${column}=${column}+1`).bind(projectId, day)];
    if (kind === 'view') statements.push(db().prepare('INSERT INTO work_referrers (project_id,day,source,views) VALUES (?,?,?,1) ON CONFLICT(project_id,day,source) DO UPDATE SET views=views+1').bind(projectId, day, referrerSource(request)));
    await db().batch(statements);
  } catch {}
}
/** Counts one reader opening an episode or update note. Never throws. */
export async function countEntry(request: Request, projectId: string, entryId: string) {
  try {
    if (!human(request)) return;
    await db().prepare('INSERT INTO entry_stats (project_id,entry_id,day,views) VALUES (?,?,?,1) ON CONFLICT(entry_id,day) DO UPDATE SET views=views+1').bind(projectId, entryId, kstDay()).run();
  } catch {}
}

export type WorkStats = {
  views30: number; clicks30: number; views7: number; saves: number;
  daily: { day: string; views: number; clicks: number }[];
  sources: { source: string; views: number }[];
  entries: { id: string; views: number }[];
};
/** The creator's own panel: last 30 days day by day, where views came from, and all-time views per episode/update. */
export async function workStats(projectId: string): Promise<WorkStats> {
  const since = kstDay(Date.now() - 29 * 86400000), week = kstDay(Date.now() - 6 * 86400000);
  const empty = { results: [] as Record<string, unknown>[] };
  const [days, sources, entries, saves] = await db().batch<Record<string, unknown>>([
    db().prepare('SELECT day,views,clicks FROM work_stats WHERE project_id=? AND day>=? ORDER BY day').bind(projectId, since),
    db().prepare('SELECT source,SUM(views) views FROM work_referrers WHERE project_id=? AND day>=? GROUP BY source ORDER BY views DESC LIMIT 6').bind(projectId, since),
    db().prepare('SELECT entry_id,SUM(views) views FROM entry_stats WHERE project_id=? GROUP BY entry_id').bind(projectId),
    db().prepare('SELECT COUNT(*) n FROM bookmarks WHERE project_id=?').bind(projectId),
  ]).catch(() => [empty, empty, empty, { results: [{ n: 0 }] }]);
  const byDay = new Map(days.results.map(r => [String(r.day), r]));
  const daily = Array.from({ length: 30 }, (_, i) => { const day = kstDay(Date.now() - (29 - i) * 86400000); const r = byDay.get(day); return { day, views: Number(r?.views || 0), clicks: Number(r?.clicks || 0) }; });
  return {
    views30: daily.reduce((n, d) => n + d.views, 0), clicks30: daily.reduce((n, d) => n + d.clicks, 0),
    views7: daily.filter(d => d.day >= week).reduce((n, d) => n + d.views, 0), saves: Number(saves.results[0]?.n || 0),
    daily, sources: sources.results.map(r => ({ source: String(r.source), views: Number(r.views) })),
    entries: entries.results.map(r => ({ id: String(r.entry_id), views: Number(r.views) })),
  };
}
