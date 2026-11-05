import { db } from '../../../../lib/api';
import { currentUser } from '../../../../lib/auth';
import { loginRedirect, messagePage } from '../../../../lib/page-shell';
import { resolveContent } from '../../../../lib/projects';
import { workFormPage } from '../../../../lib/work-form';

// Only the member who uploaded a work edits it here (curated works are edited in /admin).
export const dynamic = 'force-dynamic';
const parse = <T>(value: unknown, fallback: T): T => { try { return JSON.parse(String(value)) ?? fallback; } catch { return fallback; } };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await currentUser().catch(() => null);
  if (!user) return loginRedirect(`/works/${encodeURIComponent(id)}/edit`);
  const row = await db().prepare("SELECT title,type,url,description,status,genres,details,content,visibility,hidden_at,CASE WHEN image LIKE 'data:%' THEN '/api/projects/' || id || '/cover?v=' || length(image) ELSE image END AS image FROM projects WHERE id=? AND owner_id=? AND source='community' AND deleted_at IS NULL").bind(id, user.id).first();
  if (!row) return messagePage('수정할 작품을 찾을 수 없어요', '내가 올린 작품만 수정할 수 있어요. 공개 목록에서 내린 작품은 내 스튜디오에서 다시 공개한 뒤 수정해주세요.', 404, '/studio/works', '내 작품으로 가기');
  // a hidden work is waiting on an operator: the studio explains it and links to 이의 제기
  if (row.hidden_at) return new Response(null, { status: 302, headers: { Location: `/studio/works/${encodeURIComponent(id)}#settings`, 'Cache-Control': 'no-store' } });
  return workFormPage(user, id, {
    title: String(row.title), type: String(row.type), url: String(row.url || ''), description: String(row.description || ''), status: String(row.status || 'live'),
    genres: parse<string[]>(row.genres, []), details: parse<Record<string, unknown>>(row.details, {}), content: resolveContent(row.content), image: String(row.image || ''), draft: row.visibility === 'draft',
  });
}
