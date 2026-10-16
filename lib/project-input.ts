export const projectTypes = ['website', 'game', 'app'] as const;

export function publicUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.') || host.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return '';
    return url.href;
  } catch { return ''; }
}

export function parseProject(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const clean = (value: unknown, min: number, max: number) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max ? value.trim() : '';
  const title = clean(b.title, 1, 60);
  const creator = clean(b.creator, 1, 40);
  const description = clean(b.description, 1, 500);
  const type = typeof b.type === 'string' && projectTypes.includes(b.type as typeof projectTypes[number]) ? b.type : '';
  const url = publicUrl(b.url);
  const image = b.image ? publicUrl(b.image) : '';
  if (!title || !creator || !description || !type || !url || (b.image && !image)) return null;
  return { title, creator, description, type, url, image };
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !!origin && origin === new URL(request.url).origin;
}

export async function boundedBody(request: Request, limit = 12000): Promise<string | null> {
  if (Number(request.headers.get('content-length') || '0') > limit || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
  } finally { reader.releaseLock(); }
}
