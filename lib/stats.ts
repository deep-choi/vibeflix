import { db } from './api';
import { kstDay } from './admin';

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;
/** Counts a detail view or an outbound link click for a work (per KST day). Never throws. */
export async function countWork(request: Request, projectId: string, kind: 'view' | 'click') {
  try {
    const ua = request.headers.get('user-agent') || '';
    if (!ua || BOT.test(ua) || request.headers.get('purpose') === 'prefetch') return;
    const column = kind === 'view' ? 'views' : 'clicks';
    await db().prepare(`INSERT INTO work_stats (project_id,day,${column}) VALUES (?,?,1) ON CONFLICT(project_id,day) DO UPDATE SET ${column}=${column}+1`).bind(projectId, kstDay()).run();
  } catch {}
}
/** Last 30 days for the creator's own panel. */
export async function workStats(projectId: string) {
  const since = kstDay(Date.now() - 29 * 86400000);
  const r = await db().prepare('SELECT COALESCE(SUM(views),0) views,COALESCE(SUM(clicks),0) clicks FROM work_stats WHERE project_id=? AND day>=?').bind(projectId, since).first().catch(() => null);
  const week = await db().prepare('SELECT COALESCE(SUM(views),0) views FROM work_stats WHERE project_id=? AND day>=?').bind(projectId, kstDay(Date.now() - 6 * 86400000)).first().catch(() => null);
  const saves = await db().prepare('SELECT COUNT(*) n FROM bookmarks WHERE project_id=?').bind(projectId).first().catch(() => null);
  return { views30: Number(r?.views || 0), clicks30: Number(r?.clicks || 0), views7: Number(week?.views || 0), saves: Number(saves?.n || 0) };
}
