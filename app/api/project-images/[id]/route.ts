import { env } from 'cloudflare:workers';
import { currentUser } from '../../../../lib/auth';
import { parseGalleryImage } from '../../../../lib/project-input';

export const dynamic = 'force-dynamic';
const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

// Body and episode images. Images of a draft work, or of an episode that is a draft or scheduled for later,
// are only for the work's owner and are never cached publicly; everything else is immutable and cacheable.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const row = await env.DB!.prepare("SELECT i.data,p.owner_id,p.visibility,e.status AS entry_status,e.published_at AS entry_published FROM project_images i JOIN projects p ON p.id = i.project_id LEFT JOIN entries e ON e.id = i.entry_id WHERE i.id = ? AND p.deleted_at IS NULL AND p.hidden_at IS NULL AND (i.entry_id IS NULL OR e.id IS NOT NULL)").bind(id).first<{ data: string; owner_id: string; visibility: string; entry_status: string | null; entry_published: number | null }>();
    const image = row && parseGalleryImage(row.data);
    if (!row || !image) return notFound();
    const unpublished = row.visibility !== 'public' || (row.entry_status !== null && (row.entry_status !== 'published' || Number(row.entry_published) > Date.now()));
    if (unpublished && (await currentUser().catch(() => null))?.id !== row.owner_id) return notFound();
    // Image ids are random and never reused for new content, so published bytes are immutable.
    return new Response(image.bytes as unknown as BodyInit, { headers: { 'Content-Type': image.type, 'Cache-Control': unpublished ? 'private, no-store' : 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
  } catch { return notFound(); }
}
