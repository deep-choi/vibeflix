import { db, json } from '../../../../../lib/api';
import { sameOrigin } from '../../../../../lib/project-input';
import { countWork } from '../../../../../lib/stats';

// Beacon from the site: the preview panel was opened ('view') or an outbound link was followed ('click').
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  const { id } = await context.params;
  const kind = new URL(request.url).searchParams.get('kind') === 'click' ? 'click' : 'view';
  const exists = await db().prepare("SELECT 1 FROM projects WHERE id=? AND deleted_at IS NULL AND visibility='public'").bind(id).first().catch(() => null);
  if (exists) await countWork(request, id, kind);
  return json({ ok: true });
}
