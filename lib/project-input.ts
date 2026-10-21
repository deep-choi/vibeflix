import genreTaxonomy from '../public/genres.json';

export const projectTypes = ['website', 'game', 'app', 'art', 'video', 'novel'] as const;
export { genreTaxonomy };
export const MAX_GENRES = 3;
/** Keeps only genres that exist for this category, in taxonomy order, at most MAX_GENRES. */
export function parseGenres(type: string, value: unknown): string[] {
  const allowed: string[] = (genreTaxonomy as Record<string, string[]>)[type] || [];
  const picked = new Set(Array.isArray(value) ? value.map(String) : []);
  return allowed.filter(g => picked.has(g)).slice(0, MAX_GENRES);
}

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
export const PROJECT_BODY_LIMIT = Math.ceil((COVER.maxBytes + 8 * GALLERY.maxBytes) / 3) * 4 + 120000; // cover + 8 body images + text

/** Decodes a description image: real PNG/JPEG/WebP, within the byte and pixel limits. */
export function parseGalleryImage(value: unknown): { type: string; bytes: Uint8Array } | null {
  const image = decodeImage(value, GALLERY.maxBytes);
  return image && image.width > 0 && image.height > 0 && image.width <= GALLERY.maxDimension && image.height <= GALLERY.maxDimension ? image : null;
}

/** YouTube / Vimeo link → embeddable id, or null. */
export function parseVideoUrl(value: unknown): { provider: 'youtube' | 'vimeo'; id: string } | null {
  const href = publicUrl(normalizeUrl(value));
  if (!href) return null;
  const url = new URL(href); const host = url.hostname.replace(/^(www|m)\./, '');
  const yt = host === 'youtu.be' ? url.pathname.slice(1) : host === 'youtube.com' || host === 'youtube-nocookie.com' ? (url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1] || '') : '';
  if (/^[\w-]{11}$/.test(yt)) return { provider: 'youtube', id: yt };
  const vm = host === 'vimeo.com' || host === 'player.vimeo.com' ? url.pathname.match(/(\d{6,12})/)?.[1] : null;
  return vm ? { provider: 'vimeo', id: vm } : null;
}

const str = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const list = (v: unknown, count: number, max: number) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\n|,/) : []).map(x => str(x, max)).filter(Boolean).slice(0, count);
/** Category-specific fields; unknown keys are dropped. */
const WARNINGS = ['violence', 'horror', 'language', 'mature', 'flashing'] as const;
/** itch.io HTML5 embeds are the only third-party game frames we allow on our pages. */
export const itchEmbed = (v: unknown) => { const u = publicUrl(normalizeUrl(v)); return /^https:\/\/itch\.io\/embed-upload\/\d+(\?[\w=&%-]*)?$/.test(u) ? u : ''; };
/** Category-specific fields plus the shared AI-making info and content warnings; unknown keys are dropped. */
export function parseDetails(type: string, value: unknown): Record<string, unknown> {
  const d = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const pick = <T extends string>(v: unknown, options: readonly T[]) => options.includes(v as T) ? v as T : undefined;
  const subset = (v: unknown, options: readonly string[]) => list(v, options.length, 20).filter(x => options.includes(x));
  const url = (v: unknown) => publicUrl(normalizeUrl(str(v, 2000)));
  const form = pick(d.form, ['single', 'serial'] as const);
  const out: Record<string, unknown> = ({
    website: { features: list(d.features, 5, 80), stack: list(d.stack, 8, 30) },
    app: { platforms: subset(d.platforms, ['ios', 'android', 'web']), appStore: url(d.appStore), playStore: url(d.playStore), price: pick(d.price, ['free', 'paid', 'iap'] as const), beta: d.beta === true || d.beta === 'on' || undefined, betaUrl: url(d.betaUrl) },
    game: { stage: pick(d.stage, ['demo', 'early', 'release'] as const), playMode: pick(d.playMode, ['browser', 'download', 'mobile'] as const), inputs: subset(d.inputs, ['keyboard', 'mouse', 'gamepad', 'touch']), controls: str(d.controls, 500), playtime: str(d.playtime, 30), trailer: parseVideoUrl(d.trailer) ? url(d.trailer) : '', embed: itchEmbed(d.embed) },
    art: { format: pick(d.format, ['illustration', 'webtoon', 'comic'] as const), form, license: pick(d.license, ['all-rights', 'cc-by', 'cc-by-nc', 'cc0'] as const) },
    video: { duration: str(d.duration, 20), form, chapters: str(d.chapters, 2000), credits: str(d.credits, 1000) },
    novel: { status: pick(d.status, ['ongoing', 'complete'] as const), form },
  } as Record<string, Record<string, unknown>>)[type] || {};
  if (['art', 'video', 'novel', 'game'].includes(type)) out.warnings = subset(d.warnings, WARNINGS);
  // How it was made with AI — the point of this site, shared by every category
  const m = d.making && typeof d.making === 'object' ? d.making as Record<string, unknown> : {};
  const making = clean({ tools: list(m.tools, 8, 30), days: str(m.days, 30), process: str(m.process, 2000), github: url(m.github), openSource: m.openSource === true || m.openSource === 'on' || undefined });
  if (Object.keys(making).length) out.making = making;
  return clean(out);
}
// drop empty values so the stored JSON stays small
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));

export const CONTENT = { maxBlocks: 60, maxImages: 8, maxText: 5000, maxTotalText: 50000, maxHeading: 100, maxCaption: 200 } as const;
export type ContentBlock = { type: 'heading' | 'text'; text: string } | { type: 'image'; id?: string; data?: string; caption?: string } | { type: 'video'; url: string };
/** Validates the vertical body. Image blocks carry an existing image id or a new data URL. Returns null when invalid. */
export function parseContent(value: unknown): ContentBlock[] | null {
  if (!Array.isArray(value) || value.length > CONTENT.maxBlocks) return null;
  let images = 0, total = 0; const out: ContentBlock[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const b = raw as Record<string, unknown>;
    if (b.type === 'heading' || b.type === 'text') {
      const text = typeof b.text === 'string' ? b.text.replace(/\r\n/g, '\n').trim() : '';
      if (!text) continue;
      if (text.length > (b.type === 'heading' ? CONTENT.maxHeading : CONTENT.maxText)) return null;
      total += text.length; out.push({ type: b.type, text });
    } else if (b.type === 'video') {
      if (!parseVideoUrl(b.url)) return null;
      out.push({ type: 'video', url: publicUrl(normalizeUrl(b.url)) });
    } else if (b.type === 'image') {
      if (++images > CONTENT.maxImages) return null;
      const caption = str(b.caption, CONTENT.maxCaption);
      if (typeof b.id === 'string' && /^img-[\w-]{1,80}$/.test(b.id)) out.push({ type: 'image', id: b.id, caption });
      else if (parseGalleryImage(b.data)) out.push({ type: 'image', data: String(b.data), caption });
      else return null;
    } else return null;
  }
  return total > CONTENT.maxTotalText ? null : out;
}

/** Where the main link is required: sites and games need one, apps need a link or a store link, videos need YouTube/Vimeo. */
function linkProblem(type: string, url: string, details: Record<string, unknown>) {
  if (type === 'video') return parseVideoUrl(url) ? '' : 'video';
  if (type === 'app') return url || details.appStore || details.playStore ? '' : 'app';
  if (type === 'website' || type === 'game') return url ? '' : 'link';
  return '';
}

export function parseProject(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const clean = (value: unknown, min: number, max: number) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max ? value.trim() : '';
  const title = clean(b.title, 1, 60);
  const creator = clean(b.creator, 1, 40);
  const description = clean(b.description, 1, 1000);
  const type = typeof b.type === 'string' && projectTypes.includes(b.type as typeof projectTypes[number]) ? b.type : '';
  const rawUrl = typeof b.url === 'string' ? b.url.trim() : '';
  const url = rawUrl ? publicUrl(normalizeUrl(rawUrl)) : '';
  if (!title || !creator || !description || !type || (rawUrl && !url)) return null;
  const details = parseDetails(type, b.details);
  if (linkProblem(type, url, details)) return null;
  return { title, creator, description, type, url, genres: parseGenres(type, b.genres), details };
}
/** Human-readable reason parseProject rejected a body (for the error message). */
export function projectProblem(body: unknown) {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const type = String(b.type || '');const rawUrl = typeof b.url === 'string' ? b.url.trim() : '';const url = rawUrl ? publicUrl(normalizeUrl(rawUrl)) : '';
  if (rawUrl && !url) return '작품 링크는 공개된 http(s) 주소여야 해요.';
  const problem = linkProblem(type, url, parseDetails(type, b.details));
  return problem === 'video' ? '영상 링크는 YouTube 또는 Vimeo 주소여야 해요.' : problem === 'app' ? '앱은 작품 링크나 스토어 링크 중 하나가 필요해요.' : problem === 'link' ? '작품 링크를 입력해주세요.' : '이름, 소개, 카테고리를 확인해주세요.';
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
