import { env } from 'cloudflare:workers';
import { parseCover } from '../../../../../lib/project-input';

export const dynamic = 'force-dynamic';
const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const row = await env.DB!.prepare("SELECT image FROM projects WHERE id = ? AND deleted_at IS NULL AND hidden_at IS NULL AND image LIKE 'data:%'").bind(id).first<{ image: string }>();
    const cover = row && parseCover(row.image);
    if (!cover) return notFound();
    return new Response(cover.bytes as unknown as BodyInit, { headers: { 'Content-Type': cover.type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
  } catch { return notFound(); }
}
