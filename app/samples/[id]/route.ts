import { db } from '../../../lib/api';
import { sampleContent, type Panel, type Scene } from '../../../lib/sample-content';

// Viewer for operator-added sample works: a short read for novels, the artwork (or webtoon panels) for art,
// and a looping scene player for videos. Only rows with source='sample' are served.
export const dynamic = 'force-dynamic';
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

const shapes: Record<Scene['shape'], string> = {
  sun: '<circle class="sun" cx="960" cy="230" r="120" fill="#fff" opacity=".85"/>',
  waves: [0, 1, 2].map(i => `<path class="wave w${i}" d="M-200 ${430 + i * 60} q 160 -50 320 0 t 320 0 t 320 0 t 320 0 t 320 0 t 320 0" stroke="#fff" stroke-width="14" fill="none" opacity="${0.5 - i * 0.12}" stroke-linecap="round"/>`).join(''),
  road: '<path d="M640 720 L600 360 L680 360 Z" fill="#000" opacity=".25"/>' + [0, 1, 2, 3].map(i => `<rect class="dash d${i}" x="634" y="380" width="12" height="60" rx="6" fill="#fff" opacity=".8"/>`).join(''),
  plane: '<g class="plane"><path d="M0 0 L140 40 L0 80 L30 40 Z" fill="#fff" opacity=".95"/><path d="M30 40 L140 40" stroke="#00000033" stroke-width="3"/></g>',
  stars: Array.from({ length: 36 }, (_, i) => `<circle class="star s${i % 4}" cx="${(i * 131) % 1280}" cy="${(i * 71) % 520}" r="${(i % 3) + 2}" fill="#fff"/>`).join(''),
};

function novel(paragraphs: string[], chapter: string) {
  return `<article class="reader"><p class="chapter">${esc(chapter)}</p>${paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}<p class="end">— 다음 화는 준비 중이에요 —</p></article>`;
}
function art(image: string, title: string, note: string, panels?: Panel[]) {
  const strip = panels?.length ? `<div class="strip">${panels.map((p, i) => `<figure class="panel" style="background:${esc(p.bg)}"><span class="cut">#${i + 1}</span>${p.lines.map((l, j) => `<p class="bubble ${j % 2 ? 'right' : ''}"><b>${esc(l.who)}</b>${esc(l.text)}</p>`).join('')}${p.note ? `<figcaption>${esc(p.note)}</figcaption>` : ''}</figure>`).join('')}</div>` : '';
  return `<figure class="artwork"><img src="${esc(image)}" alt="${esc(title)}"></figure><p class="note">${esc(note)}</p>${strip}`;
}
function video(scenes: Scene[]) {
  return `<div class="player" id="player" data-scenes='${esc(JSON.stringify(scenes))}'>
    <div class="screen" id="screen"><svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" id="shape" aria-hidden="true"></svg><div class="caption"><strong id="caption"></strong><span id="sub"></span></div><button class="big-play" id="big-play" aria-label="재생">▶</button></div>
    <div class="controls"><button id="toggle" aria-label="재생">▶</button><div class="bar" id="bar"><span id="fill"></span></div><time id="time">0:00 / 0:30</time></div>
  </div><template id="shapes">${Object.entries(shapes).map(([k, v]) => `<g data-shape="${k}">${v}</g>`).join('')}</template>`;
}

const playerScript = `(()=>{const p=document.getElementById('player');if(!p)return;const scenes=JSON.parse(p.dataset.scenes),total=30000,per=total/scenes.length;
const $=id=>document.getElementById(id),screen=$('screen'),shape=$('shape'),tpl=$('shapes').content;let t=0,last=0,playing=false,shown=-1;
const fmt=ms=>{const s=Math.floor(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
function show(i){if(i===shown)return;shown=i;const s=scenes[i];screen.style.background='linear-gradient(135deg,'+s.from+','+s.to+')';shape.innerHTML=tpl.querySelector('[data-shape="'+s.shape+'"]').innerHTML;const c=$('caption');c.textContent=s.caption;$('sub').textContent=s.sub||'';screen.classList.remove('in');void screen.offsetWidth;screen.classList.add('in');}
function draw(){show(Math.min(scenes.length-1,Math.floor(t/per)));$('fill').style.width=(t/total*100)+'%';$('time').textContent=fmt(t)+' / '+fmt(total);}
function frame(now){if(!playing)return;t+=now-last;last=now;if(t>=total){t=total;draw();setPlaying(false);return;}draw();requestAnimationFrame(frame);}
function setPlaying(on){if(on&&t>=total)t=0;playing=on;p.classList.toggle('playing',on);$('toggle').textContent=on?'❚❚':'▶';$('toggle').setAttribute('aria-label',on?'일시정지':'재생');$('big-play').hidden=on;if(on){last=performance.now();requestAnimationFrame(frame);}}
$('toggle').onclick=$('big-play').onclick=()=>setPlaying(!playing);screen.onclick=e=>{if(e.target===screen||e.target.closest('svg'))setPlaying(!playing);};
$('bar').onclick=e=>{const r=e.currentTarget.getBoundingClientRect();t=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*total;draw();};
document.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();setPlaying(!playing);}});draw();})();`;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const content = sampleContent[id];
  if (!content) return notFound();
  const row = await db().prepare("SELECT id,title,creator,type,description,image,genres FROM projects WHERE id=? AND source='sample' AND deleted_at IS NULL AND hidden_at IS NULL").bind(id).first().catch(() => null);
  if (!row) return notFound();
  let genres: string[] = [];try { genres = JSON.parse(String(row.genres || '[]')); } catch {}
  const typeName = ({ art: '그림·만화', video: '영상', novel: '소설' } as Record<string, string>)[String(row.type)] || '';
  const body = content.kind === 'novel' ? novel(content.paragraphs, content.chapter) : content.kind === 'art' ? art(String(row.image), String(row.title), content.note, content.panels) : video(content.scenes);
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><meta name="theme-color" content="#000000"><title>${esc(row.title)} (예시) · VIBEFLIX</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;700&family=Noto+Sans+KR:wght@400;500;700;800&family=Noto+Serif+KR:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{color-scheme:dark;--lime:#c3f568}*{box-sizing:border-box}body{margin:0;background:#000;color:#e8e8e8;font:15px/1.7 'DM Sans','Noto Sans KR',sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}button{font:inherit;color:inherit;border:0;background:none;cursor:pointer}
header{position:sticky;top:0;z-index:5;height:60px;padding:0 clamp(16px,4vw,56px);display:flex;align-items:center;justify-content:space-between;background:#000;border-bottom:1px solid #ffffff14}
.brand{color:var(--lime);font:700 20px 'DM Sans',sans-serif;letter-spacing:-1.2px}.back{font-size:13.5px;color:#bdbdbd}.back:hover{color:#fff}
.notice{background:#c3f5681a;color:var(--lime);text-align:center;font-size:13px;font-weight:600;padding:9px 16px}
main{max-width:1100px;margin:0 auto;padding:40px clamp(16px,4vw,40px) 96px}
.head{margin-bottom:32px}.kicker{font:600 11px 'DM Sans',sans-serif;letter-spacing:3px;color:var(--lime)}.head h1{margin:10px 0 6px;font-size:clamp(30px,4.4vw,52px);line-height:1.15;letter-spacing:-1.2px;color:#fff}
.meta{color:#9a9a9a;font-size:14px}.meta span+span:before{content:' · '}
.desc{max-width:680px;margin:14px 0 0;color:#cfcfcf}
.reader{max-width:680px;margin:0 auto;font:17px/2 'Noto Serif KR',serif;color:#e6e6e6}.reader p{margin:0 0 1.4em}.chapter{font:600 14px 'Noto Sans KR',sans-serif;color:var(--lime);letter-spacing:1px}.end{text-align:center;color:#777;font-size:14px;margin-top:3em!important}
.artwork{margin:0;border-radius:14px;overflow:hidden;box-shadow:0 30px 80px #000}.artwork img{display:block;width:100%;height:auto}.note{max-width:680px;color:#bdbdbd;margin:18px 0 0}
.strip{max-width:560px;margin:48px auto 0;display:flex;flex-direction:column;gap:14px}.panel{position:relative;margin:0;aspect-ratio:4/3;border-radius:10px;padding:56px 22px 22px;display:flex;flex-direction:column;gap:12px;overflow:hidden}
.cut{position:absolute;top:14px;left:16px;font:700 12px 'DM Sans',sans-serif;color:#ffffffb0}.bubble{align-self:flex-start;max-width:78%;margin:0;padding:10px 14px;border-radius:16px 16px 16px 4px;background:#fff;color:#1d1d1d;font-size:15px;line-height:1.5;box-shadow:0 6px 18px #0003}.bubble.right{align-self:flex-end;border-radius:16px 16px 4px 16px}.bubble b{display:block;font-size:11.5px;color:#7a7a7a;margin-bottom:2px}
.panel figcaption{margin-top:auto;font-size:12.5px;color:#ffffffd0;font-weight:600}
.player{border-radius:14px;overflow:hidden;background:#111;box-shadow:0 30px 80px #000}.screen{position:relative;aspect-ratio:16/9;display:grid;place-items:center;transition:background .8s;cursor:pointer;overflow:hidden}.screen svg{position:absolute;inset:0;width:100%;height:100%}
.caption{position:relative;text-align:center;padding:0 24px;pointer-events:none}.caption strong{display:block;font-size:clamp(24px,4.2vw,52px);font-weight:800;letter-spacing:-1px;color:#fff;text-shadow:0 4px 30px #0006}.caption span{display:block;margin-top:8px;font-size:clamp(12px,1.4vw,16px);color:#ffffffcc;letter-spacing:2px}
.screen.in .caption{animation:rise .9s ease both}@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.big-play{position:absolute;width:76px;height:76px;border-radius:50%;background:#000000a0;font-size:26px;color:#fff;display:grid;place-items:center;padding-left:5px}.big-play[hidden]{display:none}
.controls{display:flex;align-items:center;gap:14px;padding:12px 16px;background:#141414}.controls button{width:34px;height:34px;border-radius:50%;background:#ffffff14;font-size:13px}.bar{flex:1;height:6px;border-radius:3px;background:#ffffff26;cursor:pointer;position:relative}.bar span{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:3px;background:var(--lime)}.controls time{font:500 12.5px 'DM Sans',sans-serif;color:#bdbdbd;font-variant-numeric:tabular-nums;min-width:82px;text-align:right}
.playing .sun{animation:bob 6s ease-in-out infinite}.playing .wave{animation:drift 4s linear infinite}.playing .w1{animation-duration:5s}.playing .w2{animation-duration:6.5s}.playing .dash{animation:dash 1.2s linear infinite}.playing .d1{animation-delay:-.3s}.playing .d2{animation-delay:-.6s}.playing .d3{animation-delay:-.9s}.plane{transform:translate(200px,300px)}.playing .plane{animation:fly 6s ease-in-out infinite}.playing .star{animation:twinkle 2s ease-in-out infinite}.playing .s1{animation-delay:-.5s}.playing .s2{animation-delay:-1s}.playing .s3{animation-delay:-1.5s}
@keyframes bob{50%{transform:translateY(-24px)}}@keyframes drift{to{transform:translateX(-320px)}}@keyframes dash{from{transform:translateY(0) scaleY(.4)}to{transform:translateY(320px) scaleY(2.4)}}@keyframes fly{0%{transform:translate(120px,420px) rotate(-12deg)}50%{transform:translate(620px,220px) rotate(4deg)}100%{transform:translate(1180px,320px) rotate(-6deg)}}@keyframes twinkle{50%{opacity:.25}}
@media(prefers-reduced-motion:reduce){.playing *{animation:none!important}}
</style></head><body>
<header><a class="brand" href="/">VIBEFLIX</a><a class="back" href="/">← 사이트로 돌아가기</a></header>
<div class="notice">화면 구성을 보여주기 위해 운영자가 만든 예시 작품이에요. 실제 작품이 아니에요.</div>
<main><div class="head"><span class="kicker">SAMPLE · ${esc(typeName)}</span><h1>${esc(row.title)}</h1><div class="meta"><span>${esc(row.creator)}</span>${genres.map(g => `<span>${esc(g)}</span>`).join('')}</div><p class="desc">${esc(row.description)}</p></div>${body}</main>
${content.kind === 'video' ? `<script>${playerScript}</script>` : ''}</body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' } });
}
