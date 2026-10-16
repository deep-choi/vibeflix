import { env } from 'cloudflare:workers';
import { parseGalleryImage } from '../../../../lib/project-input';

export const dynamic = 'force-dynamic';
const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const row = await env.DB!.prepare('SELECT i.data FROM project_images i JOIN projects p ON p.id = i.project_id WHERE i.id = ? AND p.deleted_at IS NULL AND p.hidden_at IS NULL').bind(id).first<{ data: string }>();
    const image = row && parseGalleryImage(row.data);
    if (!image) return notFound();
    // Image ids are random and never reused for new content, so the bytes are immutable.
    return new Response(image.bytes as unknown as BodyInit, { headers: { 'Content-Type': image.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
  } catch { return notFound(); }
}
