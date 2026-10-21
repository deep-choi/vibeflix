import { parseVideoUrl } from './project-input';

// Shared bits for the server-rendered pages (/works, /works/:id/e/:entry, /creators).
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const typeNames: Record<string, string> = { website: '웹사이트', game: '게임', app: '앱', art: '그림·만화', video: '영상', novel: '소설' };
export const fmtDate = (t: unknown) => new Date(Number(t) + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, '.');

export function embed(url: string, title: string) {
  const v = parseVideoUrl(url);
  if (!v) return '';
  const src = v.provider === 'youtube' ? `https://www.youtube-nocookie.com/embed/${v.id}?rel=0` : `https://player.vimeo.com/video/${v.id}?dnt=1`;
  return `<div class="frame"><iframe src="${esc(src)}" title="${esc(title)} 영상" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
}

export type ViewBlock = { type: 'heading' | 'text'; text: string } | { type: 'image'; src: string; caption?: string } | { type: 'video'; url: string };
/** Vertical body: headings, paragraphs, images (with captions) and embedded videos. */
export const renderBlocks = (blocks: ViewBlock[], title: string) => blocks.map(b =>
  b.type === 'image' ? `<figure><img src="${esc(b.src)}" alt="" loading="lazy">${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`
  : b.type === 'video' ? `<figure class="video">${embed(b.url, title)}</figure>`
  : b.type === 'heading' ? `<h2>${esc(b.text)}</h2>` : `<p>${esc(b.text)}</p>`).join('');

export const BASE_CSS = `[hidden]{display:none!important}:root{color-scheme:dark;--lime:#c3f568;--panel:#141414;--line:#ffffff14}*{box-sizing:border-box}body{margin:0;background:#000;color:#e8e8e8;font:15px/1.7 'DM Sans','Noto Sans KR',sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}button,input,textarea,select{font:inherit;color:inherit}button{border:0;background:none;cursor:pointer}
header.top{position:sticky;top:0;z-index:5;height:60px;padding:0 clamp(16px,4vw,56px);display:flex;align-items:center;justify-content:space-between;background:#000;border-bottom:1px solid var(--line)}
.brand{color:var(--lime);font:700 20px 'DM Sans',sans-serif;letter-spacing:-1.2px}.back{font-size:13.5px;color:#bdbdbd}.back:hover{color:#fff}
.notice{background:#c3f5681a;color:var(--lime);text-align:center;font-size:13px;font-weight:600;padding:9px 16px}.notice.warn{background:#ffb4471a;color:#ffc46b}
main{max-width:1000px;margin:0 auto;padding:32px clamp(16px,4vw,40px) 96px}
.btn{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 20px;border-radius:999px;background:#ffffff12;border:1px solid #ffffff24;font-weight:700;font-size:14px;line-height:1;white-space:nowrap}.btn:hover{background:#ffffff1f}.btn.primary{background:var(--lime);border-color:var(--lime);color:#17210e}.btn.primary:hover{background:#d3ff7c}.btn.on{border-color:var(--lime);color:var(--lime)}.btn.disabled,.btn:disabled{opacity:.5;pointer-events:none}.btn.small{min-height:34px;padding:0 14px;font-size:13px}
.frame{position:relative;aspect-ratio:16/9;border-radius:16px;overflow:hidden;background:#111;box-shadow:0 30px 80px #000}.frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.body{max-width:760px;margin:40px auto 0}.body h2{margin:44px 0 14px;font-size:22px;line-height:1.4;color:#fff}.body h2:first-child{margin-top:0}.body p{margin:0 0 1.2em;white-space:pre-line;font-size:16.5px;line-height:1.95;color:#e4e4e4}
.body figure{margin:24px 0}.body figure img{display:block;width:100%;height:auto;border-radius:12px}.body figcaption{margin-top:8px;font-size:13px;color:#8d8d8d;text-align:center}
.body.novel p{font:17.5px/2.05 'Noto Serif KR',serif}.body.stacked{max-width:720px}.body.stacked figure{margin:0}.body.stacked figure img{border-radius:0}.body.stacked figure:first-of-type img{border-radius:12px 12px 0 0}.body.stacked figure:last-of-type img{border-radius:0 0 12px 12px}
.body.phones figure img.portrait{max-width:340px;margin:0 auto;border-radius:28px;border:8px solid #1f1f1f;box-shadow:0 20px 60px #000}
.section-title{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:48px 0 14px}.section-title h2{margin:0;font-size:20px;color:#fff}.section-title span{font-size:13px;color:#8d8d8d}
.muted{color:#8d8d8d}.chip{display:inline-flex;font-style:normal;font-size:12.5px;font-weight:600;padding:3px 10px;border-radius:999px;background:#ffffff12;border:1px solid #ffffff1f}`;

export const FONTS = '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;700&family=Noto+Sans+KR:wght@400;500;700;800&family=Noto+Serif+KR:wght@400;600&display=swap" rel="stylesheet">';
export const pageHead = (title: string, extra = '') => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#000000"><title>${esc(title)} · VIBEFLIX</title>${FONTS}${extra}`;
export const topBar = (back = '/', label = '사이트로 돌아가기') => `<header class="top"><a class="brand" href="/">VIBEFLIX</a><a class="back" href="${esc(back)}">← ${esc(label)}</a></header>`;
export const htmlResponse = (html: string, headers: Record<string, string> = {}) => new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', ...headers } });
