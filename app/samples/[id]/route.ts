// Sample works now use the same detail page as every other work.
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return Response.redirect(new URL(`/works/${encodeURIComponent(id)}`, request.url).href, 301);
}
