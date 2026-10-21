import { db } from '../../../lib/api';
import { parseVideoUrl } from '../../../lib/project-input';
import { resolveContent } from '../../../lib/projects';
import { sampleBlocks, sampleContent, type Scene, type ViewBlock } from '../../../lib/sample-content';

// One detail page for every work. Videos get a player on top; everything else reads top to bottom:
// cover → title and category info → description → body blocks (headings, text, images).
export const dynamic = 'force-dynamic';
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const typeNames: Record<string, string> = { website: '웹사이트', game: '게임', app: '앱', art: '그림·만화', video: '영상', novel: '소설' };
const notFound = () => new Response('작품을 찾을 수 없어요.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

function embed(url: string, title: string) {
  const v = parseVideoUrl(url);
  if (!v) return '';
  const src = v.provider === 'youtube' ? `https://www.youtube-nocookie.com/embed/${v.id}?rel=0` : `https://player.vimeo.com/video/${v.id}?dnt=1`;
  return `<div class="frame"><iframe src="${esc(src)}" title="${esc(title)} 영상" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
}

const shapes: Record<Scene['shape'], string> = {
  sun: '<circle class="sun" cx="960" cy="230" r="120" fill="#fff" opacity=".85"/>',
  waves: [0, 1, 2].map(i => `<path class="wave w${i}" d="M-200 ${430 + i * 60} q 160 -50 320 0 t 320 0 t 320 0 t 320 0 t 320 0 t 320 0" stroke="#fff" stroke-width="14" fill="none" opacity="${0.5 - i * 0.12}" stroke-linecap="round"/>`).join(''),
  road: '<path d="M640 720 L600 360 L680 360 Z" fill="#000" opacity=".25"/>' + [0, 1, 2, 3].map(i => `<rect class="dash d${i}" x="634" y="380" width="12" height="60" rx="6" fill="#fff" opacity=".8"/>`).join(''),
  plane: '<g class="plane"><path d="M0 0 L140 40 L0 80 L30 40 Z" fill="#fff" opacity=".95"/><path d="M30 40 L140 40" stroke="#00000033" stroke-width="3"/></g>',
  stars: Array.from({ length: 36 }, (_, i) => `<circle class="star s${i % 4}" cx="${(i * 131) % 1280}" cy="${(i * 71) % 520}" r="${(i % 3) + 2}" fill="#fff"/>`).join(''),
};
const scenePlayer = (scenes: Scene[]) => `<div class="player" id="player" data-scenes='${esc(JSON.stringify(scenes))}'><div class="screen" id="screen"><svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" id="shape" aria-hidden="true"></svg><div class="caption"><strong id="caption"></strong><span id="sub"></span></div><button class="big-play" id="big-play" aria-label="재생">▶</button></div><div class="controls"><button id="toggle" aria-label="재생">▶</button><div class="bar" id="bar"><span id="fill"></span></div><time id="time">0:00 / 0:30</time></div></div><template id="shapes">${Object.entries(shapes).map(([k, v]) => `<g data-shape="${k}">${v}</g>`).join('')}</template>`;
const playerScript = `(()=>{const p=document.getElementById('player');if(!p)return;const scenes=JSON.parse(p.dataset.scenes),total=30000,per=total/scenes.length;
const $=id=>document.getElementById(id),screen=$('screen'),shape=$('shape'),tpl=$('shapes').content;let t=0,last=0,playing=false,shown=-1;
const fmt=ms=>{const s=Math.floor(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
function show(i){if(i===shown)return;shown=i;const s=scenes[i];screen.style.background='linear-gradient(135deg,'+s.from+','+s.to+')';shape.innerHTML=tpl.querySelector('[data-shape="'+s.shape+'"]').innerHTML;$('caption').textContent=s.caption;$('sub').textContent=s.sub||'';screen.classList.remove('in');void screen.offsetWidth;screen.classList.add('in');}
function draw(){show(Math.min(scenes.length-1,Math.floor(t/per)));$('fill').style.width=(t/total*100)+'%';$('time').textContent=fmt(t)+' / '+fmt(total);}
function frame(now){if(!playing)return;t+=now-last;last=now;if(t>=total){t=total;draw();setPlaying(false);return;}draw();requestAnimationFrame(frame);}
function setPlaying(on){if(on&&t>=total)t=0;playing=on;p.classList.toggle('playing',on);$('toggle').textContent=on?'❚❚':'▶';$('toggle').setAttribute('aria-label',on?'일시정지':'재생');$('big-play').hidden=on;if(on){last=performance.now();requestAnimationFrame(frame);}}
$('toggle').onclick=$('big-play').onclick=()=>setPlaying(!playing);screen.onclick=e=>{if(e.target===screen||e.target.closest('svg'))setPlaying(!playing);};
$('bar').onclick=e=>{const r=e.currentTarget.getBoundingClientRect();t=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*total;draw();};
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!/input|textarea/i.test(e.target.tagName)){e.preventDefault();setPlaying(!playing);}});draw();})();`;

type Details = Record<string, unknown>;
const list = (v: unknown) => (Array.isArray(v) ? v : []).map(String);
/** Category facts shown as small cards under the title. */
function infoCards(type: string, d: Details, blocks: ViewBlock[]) {
  const card = (label: string, body: string) => body ? `<div class="info"><span>${label}</span>${body}</div>` : '';
  const chips = (items: string[]) => items.length ? `<p class="chips">${items.map(x => `<em>${esc(x)}</em>`).join('')}</p>` : '';
  if (type === 'website') return card('주요 기능', list(d.features).length ? `<ul>${list(d.features).map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : '') + card('사용 기술', chips(list(d.stack)));
  if (type === 'app') return card('플랫폼', chips(list(d.platforms).map(p => ({ ios: 'iOS', android: 'Android', web: '웹' }[p] || p))));
  if (type === 'game') return card('플레이 방식', d.playMode ? `<p>${esc({ browser: '브라우저에서 바로', download: '다운로드 설치', mobile: '모바일' }[String(d.playMode)])}</p>` : '') + card('플레이 시간', d.playtime ? `<p>${esc(d.playtime)}</p>` : '') + card('조작법', d.controls ? `<p class="pre">${esc(d.controls)}</p>` : '');
  if (type === 'art') return card('형식', d.format ? `<p>${esc({ illustration: '일러스트', webtoon: '웹툰 (세로 스크롤)', comic: '만화' }[String(d.format)])}</p>` : '');
  if (type === 'video') return card('길이', d.duration ? `<p>${esc(d.duration)}</p>` : '');
  if (type === 'novel') { const chars = blocks.reduce((n, b) => n + (b.type === 'text' ? b.text.length : 0), 0); return card('연재 상태', d.status ? `<p>${d.status === 'complete' ? '완결' : '연재 중'}</p>` : '') + card('분량', chars ? `<p>약 ${chars.toLocaleString('ko-KR')}자</p>` : ''); }
  return '';
}
/** Buttons by category: open the site / stores / play / watch, or jump down to the body. */
function actions(row: Record<string, unknown>, d: Details, hasBody: boolean) {
  const out: string[] = []; const url = String(row.url || ''); const type = String(row.type);
  const ext = (href: string, label: string, primary = false) => `<a class="btn${primary ? ' primary' : ''}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  if (row.status === 'upcoming') out.push('<span class="btn primary disabled">공개 준비 중</span>');
  else if (row.source === 'sample') { if (hasBody) out.push(`<a class="btn primary" href="#content">${type === 'novel' ? '1화 읽기 ↓' : '예시 보기 ↓'}</a>`); }
  else if (type === 'website' && url) out.push(ext(url, '사이트 열기 ↗', true));
  else if (type === 'game' && url) out.push(ext(url, '▶ 지금 플레이 ↗', true));
  else if (type === 'video' && url) out.push(ext(url, `${parseVideoUrl(url)?.provider === 'vimeo' ? 'Vimeo' : 'YouTube'}에서 보기 ↗`));
  else if (type === 'app') { if (d.appStore) out.push(ext(String(d.appStore), 'App Store ↗', true)); if (d.playStore) out.push(ext(String(d.playStore), 'Google Play ↗', !d.appStore)); if (url) out.push(ext(url, '웹에서 열기 ↗', !d.appStore && !d.playStore)); }
  else if (hasBody) out.push(`<a class="btn primary" href="#content">${type === 'novel' ? '읽기 시작 ↓' : '작품 보기 ↓'}</a>`);
  if ((type === 'art' || type === 'novel') && url && row.source !== 'sample') out.push(ext(url, '원본 링크 ↗'));
  out.push(`<a class="btn" href="/#work=${encodeURIComponent(String(row.id))}">별점 · 댓글</a>`);
  return out.join('');
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const row = await db().prepare("SELECT id,title,creator,type,description,subtitle,url,CASE WHEN image LIKE 'data:%' THEN '/api/projects/' || id || '/cover?v=' || length(image) ELSE image END AS image,genres,details,content,status,source FROM projects WHERE id=? AND deleted_at IS NULL AND hidden_at IS NULL").bind(id).first().catch(() => null);
  if (!row) return notFound();
  const parse = <T>(v: unknown, fallback: T): T => { try { return JSON.parse(String(v)) ?? fallback; } catch { return fallback; } };
  const genres = parse<string[]>(row.genres, []), details = parse<Details>(row.details, {});
  const type = String(row.type), image = String(row.image || ''), sample = row.source === 'sample';
  let blocks: ViewBlock[] = resolveContent(row.content).map(b => b.type === 'image' ? { type: 'image', src: String(b.src), caption: b.caption } : { type: b.type as 'heading' | 'text', text: String(b.text) });
  if (sample && !blocks.length) blocks = sampleBlocks(id, image);
  // works saved before the body editor only have description images
  if (!blocks.length) blocks = ((await db().prepare('SELECT id FROM project_images WHERE project_id=? ORDER BY position').bind(id).all()).results).map(r => ({ type: 'image' as const, src: `/api/project-images/${r.id}` }));
  const stats = await db().prepare("SELECT (SELECT AVG(score) FROM ratings WHERE project_id=?) avg,(SELECT COUNT(*) FROM ratings WHERE project_id=?) n,(SELECT COUNT(*) FROM reactions WHERE target_kind='project' AND target_id=?) likes,(SELECT COUNT(*) FROM comments WHERE target_kind='project' AND target_id=? AND deleted_at IS NULL AND hidden_at IS NULL) comments").bind(id, id, id, id).first().catch(() => null);

  const scenes = sample ? (sampleContent[id] as { scenes?: Scene[] } | undefined)?.scenes : undefined;
  const media = type === 'video' ? (scenes ? scenePlayer(scenes) : embed(String(row.url || ''), String(row.title)) || (image ? `<img class="cover" src="${esc(image)}" alt="">` : '')) : image ? `<img class="cover" src="${esc(image)}" alt="${esc(row.title)} 커버">` : `<div class="cover blank"><span>${esc(row.title)}</span></div>`;
  const trailer = type === 'game' && details.trailer ? `<section class="block-title"><h2>트레일러</h2></section>${embed(String(details.trailer), String(row.title))}` : '';
  const stacked = type === 'art' && (details.format === 'webtoon' || details.format === 'comic');
  const bodyHtml = blocks.map(b => b.type === 'image' ? `<figure><img src="${esc(b.src)}" alt="" loading="lazy">${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>` : b.type === 'heading' ? `<h2>${esc(b.text)}</h2>` : `<p>${esc(b.text)}</p>`).join('');
  const meta = [`by ${esc(row.creator)}`, stats && Number(stats.n) ? `★ ${Number(stats.avg).toFixed(1)} (${stats.n})` : '', stats && Number(stats.likes) ? `♡ ${stats.likes}` : '', stats && Number(stats.comments) ? `댓글 ${stats.comments}` : ''].filter(Boolean);
  const origin = new URL(request.url).origin;const ogImage = image ? new URL(image, origin).href : '';

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#000000">
<title>${esc(row.title)}${sample ? ' (예시)' : ''} · VIBEFLIX</title><meta name="description" content="${esc(row.subtitle || row.description)}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(row.title)} · VIBEFLIX"><meta property="og:description" content="${esc(row.subtitle || row.description)}">${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}<meta property="og:url" content="${esc(origin)}/works/${esc(id)}">${sample ? '<meta name="robots" content="noindex">' : ''}
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;700&family=Noto+Sans+KR:wght@400;500;700;800&family=Noto+Serif+KR:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{color-scheme:dark;--lime:#c3f568;--panel:#141414;--line:#ffffff14}*{box-sizing:border-box}body{margin:0;background:#000;color:#e8e8e8;font:15px/1.7 'DM Sans','Noto Sans KR',sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}button{font:inherit;color:inherit;border:0;background:none;cursor:pointer}
header{position:sticky;top:0;z-index:5;height:60px;padding:0 clamp(16px,4vw,56px);display:flex;align-items:center;justify-content:space-between;background:#000;border-bottom:1px solid var(--line)}
.brand{color:var(--lime);font:700 20px 'DM Sans',sans-serif;letter-spacing:-1.2px}.back{font-size:13.5px;color:#bdbdbd}.back:hover{color:#fff}
.notice{background:#c3f5681a;color:var(--lime);text-align:center;font-size:13px;font-weight:600;padding:9px 16px}
main{max-width:1000px;margin:0 auto;padding:32px clamp(16px,4vw,40px) 96px}
.cover{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:16px;box-shadow:0 30px 80px #000;background:#111}.cover.blank{display:grid;place-items:center;background:linear-gradient(135deg,#1f2a1a,#0b0b0b)}.cover.blank span{font-size:clamp(28px,5vw,56px);font-weight:800;color:#fff}
.frame{position:relative;aspect-ratio:16/9;border-radius:16px;overflow:hidden;background:#111;box-shadow:0 30px 80px #000}.frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.head{margin:34px 0 26px}.kicker{font:600 11px 'DM Sans',sans-serif;letter-spacing:2.5px;color:var(--lime);text-transform:uppercase}.kicker b{color:#9a9a9a;font-weight:600;letter-spacing:.5px;text-transform:none}
h1{margin:10px 0 4px;font-size:clamp(32px,5vw,54px);line-height:1.12;letter-spacing:-1.4px;color:#fff}.sub{margin:0;font-size:17px;color:#cfcfcf}.meta{margin-top:10px;color:#9a9a9a;font-size:14px}.meta span+span:before{content:'·';margin:0 8px;color:#555}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.btn{display:inline-flex;align-items:center;min-height:46px;padding:0 22px;border-radius:999px;background:#ffffff12;border:1px solid #ffffff24;font-weight:700;font-size:14.5px;line-height:1}.btn:hover{background:#ffffff1f}.btn.primary{background:var(--lime);border-color:var(--lime);color:#17210e}.btn.primary:hover{background:#d3ff7c}.btn.disabled{opacity:.5;pointer-events:none}
.infos{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:0 0 30px}.info{padding:16px 18px;border-radius:12px;background:var(--panel);border:1px solid var(--line)}.info>span{display:block;font-size:12px;font-weight:600;color:#8d8d8d;margin-bottom:6px}.info p,.info ul{margin:0;color:#e6e6e6}.info ul{padding-left:18px}.pre{white-space:pre-line}.chips{display:flex;flex-wrap:wrap;gap:6px}.chips em{font-style:normal;font-size:12.5px;font-weight:600;padding:3px 10px;border-radius:999px;background:#ffffff12;border:1px solid #ffffff1f}
.desc{max-width:760px;margin:0 0 8px;font-size:16px;color:#d6d6d6;white-space:pre-line}
.block-title h2{font-size:20px;margin:40px 0 14px;color:#fff}
.body{max-width:760px;margin:40px auto 0;padding-top:34px;border-top:1px solid var(--line)}.body h2{margin:44px 0 14px;font-size:22px;line-height:1.4;color:#fff}.body h2:first-child{margin-top:0}.body p{margin:0 0 1.2em;white-space:pre-line;font-size:16.5px;line-height:1.95;color:#e4e4e4}
.body figure{margin:24px 0}.body figure img{display:block;width:100%;height:auto;border-radius:12px}.body figcaption{margin-top:8px;font-size:13px;color:#8d8d8d;text-align:center}
.body.novel p{font:17.5px/2.05 'Noto Serif KR',serif}.body.stacked{max-width:720px}.body.stacked figure{margin:0}.body.stacked figure img{border-radius:0}.body.stacked figure:first-of-type img{border-radius:12px 12px 0 0}.body.stacked figure:last-of-type img{border-radius:0 0 12px 12px}
.end{margin-top:48px;text-align:center;color:#777;font-size:14px}
.player{border-radius:16px;overflow:hidden;background:#111;box-shadow:0 30px 80px #000}.screen{position:relative;aspect-ratio:16/9;display:grid;place-items:center;transition:background .8s;cursor:pointer;overflow:hidden}.screen svg{position:absolute;inset:0;width:100%;height:100%}
.caption{position:relative;text-align:center;padding:0 24px;pointer-events:none}.caption strong{display:block;font-size:clamp(24px,4.2vw,52px);font-weight:800;letter-spacing:-1px;color:#fff;text-shadow:0 4px 30px #0006}.caption span{display:block;margin-top:8px;font-size:clamp(12px,1.4vw,16px);color:#ffffffcc;letter-spacing:2px}
.screen.in .caption{animation:rise .9s ease both}@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.big-play{position:absolute;width:76px;height:76px;border-radius:50%;background:#000000a0;font-size:26px;color:#fff;display:grid;place-items:center;padding-left:5px}.big-play[hidden]{display:none}
.controls{display:flex;align-items:center;gap:14px;padding:12px 16px;background:#141414}.controls button{width:34px;height:34px;border-radius:50%;background:#ffffff14;font-size:13px}.bar{flex:1;height:6px;border-radius:3px;background:#ffffff26;cursor:pointer;position:relative}.bar span{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:3px;background:var(--lime)}.controls time{font:500 12.5px 'DM Sans',sans-serif;color:#bdbdbd;font-variant-numeric:tabular-nums;min-width:82px;text-align:right}
.playing .sun{animation:bob 6s ease-in-out infinite}.playing .wave{animation:drift 4s linear infinite}.playing .w1{animation-duration:5s}.playing .w2{animation-duration:6.5s}.playing .dash{animation:dash 1.2s linear infinite}.playing .d1{animation-delay:-.3s}.playing .d2{animation-delay:-.6s}.playing .d3{animation-delay:-.9s}.plane{transform:translate(200px,300px)}.playing .plane{animation:fly 6s ease-in-out infinite}.playing .star{animation:twinkle 2s ease-in-out infinite}.playing .s1{animation-delay:-.5s}.playing .s2{animation-delay:-1s}.playing .s3{animation-delay:-1.5s}
@keyframes bob{50%{transform:translateY(-24px)}}@keyframes drift{to{transform:translateX(-320px)}}@keyframes dash{from{transform:translateY(0) scaleY(.4)}to{transform:translateY(320px) scaleY(2.4)}}@keyframes fly{0%{transform:translate(120px,420px) rotate(-12deg)}50%{transform:translate(620px,220px) rotate(4deg)}100%{transform:translate(1180px,320px) rotate(-6deg)}}@keyframes twinkle{50%{opacity:.25}}
@media(prefers-reduced-motion:reduce){.playing *{animation:none!important}}
</style></head><body>
<header><a class="brand" href="/">VIBEFLIX</a><a class="back" href="/">← 사이트로 돌아가기</a></header>
${sample ? '<div class="notice">화면 구성을 보여주기 위해 운영자가 만든 예시 작품이에요. 실제 작품이 아니에요.</div>' : ''}
<main>${media}
<div class="head"><span class="kicker">${esc(typeNames[type] || '')}${sample ? ' · SAMPLE' : ''}${genres.length ? ` <b>· ${genres.map(esc).join(' · ')}</b>` : ''}</span><h1>${esc(row.title)}</h1>${row.subtitle && row.subtitle !== row.description ? `<p class="sub">${esc(row.subtitle)}</p>` : ''}<div class="meta">${meta.map(m => `<span>${m}</span>`).join('')}</div><div class="actions">${actions(row, details, blocks.length > 0)}</div></div>
${(() => { const cards = infoCards(type, details, blocks); return cards ? `<div class="infos">${cards}</div>` : ''; })()}
<p class="desc">${esc(row.description)}</p>${trailer}
${blocks.length ? `<article class="body${type === 'novel' ? ' novel' : ''}${stacked ? ' stacked' : ''}" id="content">${bodyHtml}${type === 'novel' && sample ? '<p class="end">— 다음 화는 준비 중이에요 —</p>' : ''}</article>` : ''}
</main>${scenes ? `<script>${playerScript}</script>` : ''}</body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', ...(sample ? { 'X-Robots-Tag': 'noindex' } : {}) } });
}
