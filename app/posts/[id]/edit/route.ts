import { db } from '../../../../lib/api';
import { currentUser } from '../../../../lib/auth';
import { loginRedirect, messagePage } from '../../../../lib/page-shell';
import { postFormPage } from '../../../../lib/post-form';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await currentUser().catch(() => null);
  if (!user) return loginRedirect(`/posts/${encodeURIComponent(id)}/edit`);
  const post = await db().prepare('SELECT title,body,category,project_id FROM posts WHERE id=? AND owner_id=? AND deleted_at IS NULL AND hidden_at IS NULL').bind(id, user.id).first();
  if (!post) return messagePage('수정할 글을 찾을 수 없어요', '내가 쓴 글만 수정할 수 있어요. 숨겨지거나 삭제된 글은 수정할 수 없어요.', 404, '/account', '내 계정으로 가기');
  return postFormPage(user, { id, title: String(post.title), body: String(post.body), category: String(post.category), projectId: String(post.project_id || '') }, true, false);
}
