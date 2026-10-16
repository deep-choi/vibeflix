export const projectTypes = ['website', 'game', 'app', 'art', 'video', 'novel'] as const;

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

export const COVER = { width: 1280, height: 720, maxBytes: 800 * 1024 } as const;

export function normalizeUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : trimmed ? `https://${trimmed}` : '';
}

function imageSize(b: Uint8Array): { type: string; width: number; height: number } | null {
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  if (b.length > 24 && u32(0) === 0x89504e47 && u32(4) === 0x0d0a1a0a) return { type: 'image/png', width: u32(16), height: u32(20) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { type: 'image/jpeg', height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return null;
  }
  if (b.length > 30 && u32(0) === 0x52494646 && u32(8) === 0x57454250) {
    const kind = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (kind === 'VP8X') return { type: 'image/webp', width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (kind === 'VP8L') { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { type: 'image/webp', width: 1 + (v & 0x3fff), height: 1 + ((v >>> 14) & 0x3fff) }; }
    if (kind === 'VP8 ') return { type: 'image/webp', width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  }
  return null;
}

function decodeImage(value: unknown, maxBytes: number): { type: string; bytes: Uint8Array; width: number; height: number } | null {
  const match = typeof value === 'string' ? /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value) : null;
  if (!match || match[1].length > Math.ceil(maxBytes / 3) * 4) return null;
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(match[1]), c => c.charCodeAt(0)); } catch { return null; }
  if (bytes.length > maxBytes) return null;
  const size = imageSize(bytes);
  return size ? { bytes, ...size } : null;
}

/** Decodes an uploaded cover data URL. Returns null unless it is a real PNG/JPEG/WebP of exactly COVER size. */
export function parseCover(value: unknown): { type: string; bytes: Uint8Array } | null {
  const image = decodeImage(value, COVER.maxBytes);
  return image && image.width === COVER.width && image.height === COVER.height ? image : null;
}

export const GALLERY = { max: 4, maxBytes: 700 * 1024, maxDimension: 4096 } as const;
/** Request body ceiling for a project write: cover + full gallery as base64 + the text fields. */
export const PROJECT_BODY_LIMIT = Math.ceil((COVER.maxBytes + GALLERY.max * GALLERY.maxBytes) / 3) * 4 + 16000;

/** Decodes a description image: real PNG/JPEG/WebP, within the byte and pixel limits. */
export function parseGalleryImage(value: unknown): { type: string; bytes: Uint8Array } | null {
  const image = decodeImage(value, GALLERY.maxBytes);
  return image && image.width > 0 && image.height > 0 && image.width <= GALLERY.maxDimension && image.height <= GALLERY.maxDimension ? image : null;
}

export function parseProject(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const clean = (value: unknown, min: number, max: number) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max ? value.trim() : '';
  const title = clean(b.title, 1, 60);
  const creator = clean(b.creator, 1, 40);
  const description = clean(b.description, 1, 1000);
  const type = typeof b.type === 'string' && projectTypes.includes(b.type as typeof projectTypes[number]) ? b.type : '';
  const url = publicUrl(normalizeUrl(b.url));
  if (!title || !creator || !description || !type || !url) return null;
  return { title, creator, description, type, url };
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
