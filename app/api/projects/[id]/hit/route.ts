import { waitUntil } from 'cloudflare:workers';
import { db, json } from '../../../../../lib/api';
import { currentUser } from '../../../../../lib/auth';
import { sameOrigin } from '../../../../../lib/project-input';
import { countWork } from '../../../../../lib/stats';

// Beacon from the site: the preview panel was opened ('view') or an outbound link was followed ('click').
// Creators opening their own work are not counted; everyone else counts once per day (lib/stats.ts).
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  const { id } = await context.params;
  const kind = new URL(request.url).searchParams.get('kind') === 'click' ? 'click' : 'view';
  const work = await db().prepare("SELECT owner_id FROM projects WHERE id=? AND deleted_at IS NULL AND visibility='public'").bind(id).first().catch(() => null);
  if (work && (await currentUser().catch(() => null))?.id !== work.owner_id) waitUntil(countWork(request, id, kind));
  return json({ ok: true });
}
