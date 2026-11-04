import { env } from 'cloudflare:workers';
import { currentUser } from '../../../../../lib/auth';
import { parseCover } from '../../../../../lib/project-input';

export const dynamic = 'force-dynamic';
const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

// Uploaded covers. A draft work's cover is for its owner only and is not cached publicly.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const row = await env.DB!.prepare("SELECT image,owner_id,visibility FROM projects WHERE id = ? AND deleted_at IS NULL AND hidden_at IS NULL AND image LIKE 'data:%'").bind(id).first<{ image: string; owner_id: string; visibility: string }>();
    const cover = row && parseCover(row.image);
    if (!row || !cover) return notFound();
    const draft = row.visibility !== 'public';
    if (draft && (await currentUser().catch(() => null))?.id !== row.owner_id) return notFound();
    return new Response(cover.bytes as unknown as BodyInit, { headers: { 'Content-Type': cover.type, 'Cache-Control': draft ? 'private, no-store' : 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
  } catch { return notFound(); }
}
