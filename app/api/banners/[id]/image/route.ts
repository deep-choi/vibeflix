import { env } from 'cloudflare:workers';
import { parseBannerImage } from '../../../../../lib/projects';

export const dynamic = 'force-dynamic';
const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const row = await env.DB!.prepare("SELECT image FROM banners WHERE id = ? AND image LIKE 'data:%'").bind(id).first<{ image: string }>();
    const image = row && parseBannerImage(row.image);
    if (!image) return notFound();
    return new Response(image.bytes as unknown as BodyInit, { headers: { 'Content-Type': image.type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
  } catch { return notFound(); }
}
