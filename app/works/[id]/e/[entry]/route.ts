import { db } from '../../../../../lib/api';
import { blockedOwners } from '../../../../../lib/member-safety';
import { currentUser } from '../../../../../lib/auth';
import { entryKind, entryLabel, listEntries } from '../../../../../lib/entries';
import { resolveContent } from '../../../../../lib/projects';
import { BASE_CSS, esc, fmtDate, htmlResponse, pageHead, renderBlocks, topBar, type ViewBlock } from '../../../../../lib/page-shell';
import { countEntry } from '../../../../../lib/stats';
import { asset } from '../../../../../lib/security';
import { waitUntil } from 'cloudflare:workers';
import { DAY_NAMES } from '../../../../../lib/project-input';

// One episode or update note: title, body, the author's note, and previous/next navigation.
export const dynamic = 'force-dynamic';
const notFound = () => new Response('회차를 찾을 수 없어요.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export async function GET(request: Request, context: { params: Promise<{ id: string; entry: string }> }) {
  const { id, entry } = await context.params;
  const work = await db().prepare('SELECT id,owner_id,title,type,details,visibility,hidden_at,source FROM projects WHERE id=? AND deleted_at IS NULL').bind(id).first().catch(() => null);
  const user = await currentUser().catch(() => null);
  if(work && (await blockedOwners(user?.id)).has(String(work.owner_id)))return new Response('차단한 이용자의 콘텐츠입니다.',{status:404});
  const owner = !!work && !!user && user.id === work.owner_id && work.source === 'community';
  if (!work || ((work.hidden_at || work.visibility !== 'public') && !owner)) return notFound();
  const e = await db().prepare('SELECT * FROM entries WHERE id=? AND project_id=?').bind(entry, id).first();
  if (!e || (!owner && (e.status !== 'published' || Number(e.published_at) > Date.now()))) return notFound();
  const kind = entryKind(String(work.type)); const all = await listEntries(id, kind, owner);
  if (!owner && e.status === 'published') waitUntil(countEntry(request, id, entry));
  const i = all.findIndex(x => x.id === entry); const prev = kind === 'episode' ? all[i - 1] : all[i + 1]; const next = kind === 'episode' ? all[i + 1] : all[i - 1];
  let details: Record<string, unknown> = {}; try { details = JSON.parse(String(work.details || '{}')); } catch {}
  const blocks: ViewBlock[] = resolveContent(e.content).map(b => b.type === 'image' ? { type: 'image', src: b.src, caption: b.caption } : b);
  const stacked = work.type === 'art' && (details.format === 'webtoon' || details.format === 'comic');
  const workHref = `/works/${encodeURIComponent(id)}`; const href = (x?: { id: string }) => x ? `${workHref}/e/${encodeURIComponent(x.id)}` : '';
  const nav = (x: typeof prev, label: string) => x ? `<a href="${href(x)}"><span>${label}</span><b>${esc(entryLabel(x))}</b></a>` : '<span></span>';
  const status = e.status === 'draft' ? '임시 저장 · 나만 볼 수 있어요' : Number(e.published_at) > Date.now() ? `예약 공개 · ${fmtDate(e.published_at)}` : '';
  const live = e.status === 'published' && Number(e.published_at) <= Date.now();
  const warnings = Array.isArray(details.warnings) ? details.warnings.map(String) : [];
  const mature = warnings.includes('mature') && !owner;
  const days = (Array.isArray(details.schedule) ? details.schedule : []).map(d => DAY_NAMES[String(d)]).filter(Boolean);
  const schedule = details.form === 'serial' && days.length && details.status !== 'complete' ? `매주 ${days.join('·')} 연재` : '';
  const saved = user ? !!(await db().prepare('SELECT 1 FROM bookmarks WHERE user_id=? AND project_id=?').bind(user.id, id).first()) : false;
  // the last published episode is where readers decide whether to come back for the next one
  const cta = live && !owner && !saved && (!next || next.status !== 'published') ? `<div class="follow-cta"><p>${schedule ? `${esc(schedule)} 중이에요. ` : ''}다음 ${kind === 'episode' ? '화' : '소식'}가 올라오면 알림으로 알려드릴게요.</p><button class="btn small primary" data-save-work>＋ 찜하고 알림 받기</button></div>` : '';
  const discussion = live ? `<section class="discussion entry-discussion" id="comments"><div class="section-title"><h2>${kind === 'episode' ? '이 회차 댓글' : '이 소식에 대한 댓글'}</h2><span data-comment-count></span></div><div id="entry-comments"></div></section>` : '';
  const html = `${pageHead(`${entryLabel(e)} · ${work.title}`, work.visibility !== 'public' || status ? '<meta name="robots" content="noindex">' : '')}
<link rel="stylesheet" href="${asset('/work.css')}"><style>@layer page{${BASE_CSS}
.follow-cta{max-width:760px;margin:28px auto 0;padding:16px 18px;border-radius:12px;background:#c3f5680d;border:1px solid #c3f56833;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}.follow-cta p{margin:0;color:#dfe8d0}
.entry-discussion{max-width:760px;margin:44px auto 0}
.crumb{font-size:13.5px;color:#9a9a9a}.crumb a{color:var(--lime)}h1{margin:10px 0 6px;font-size:clamp(28px,4.4vw,44px);line-height:1.2;letter-spacing:-1px;color:#fff}.date{color:#8d8d8d;font-size:14px}
.note{max-width:760px;margin:40px auto 0;padding:18px 20px;border-radius:12px;background:var(--panel);border:1px solid var(--line)}.note span{display:block;font-size:12px;font-weight:600;color:#8d8d8d;margin-bottom:6px}.note p{margin:0;white-space:pre-line}
.pager{max-width:760px;margin:48px auto 0;display:grid;grid-template-columns:1fr 1fr;gap:12px}.pager a{display:block;padding:16px 18px;border-radius:12px;background:var(--panel);border:1px solid var(--line)}.pager a:hover{border-color:#ffffff40}.pager a:last-child{text-align:right}.pager span{display:block;font-size:12px;color:#8d8d8d}.pager b{display:block;margin-top:4px;color:#fff;font-size:15px}
.to-work{display:flex;justify-content:center;gap:10px;margin-top:28px}}</style></head><body>
${topBar(workHref, '작품으로 돌아가기')}${status ? `<div class="notice">${esc(status)}</div>` : ''}
<main${mature ? ' class="is-gated"' : ''}>${mature ? '<div class="mature-gate"><b>성인 소재가 포함된 작품이에요</b><p>작가가 성인 소재 경고를 표시했어요. 만 19세 이상이고 내용을 보고 싶을 때만 열어주세요.</p><button class="btn primary" data-mature-ok>확인하고 보기</button></div>' : ''}<p class="crumb"><a href="${workHref}">${esc(work.title)}</a> · ${kind === 'episode' ? '회차' : '업데이트 소식'}</p><h1>${esc(entryLabel(e))}</h1><p class="date">${fmtDate(e.published_at)}</p>
${blocks.length ? `<article class="body${work.type === 'novel' ? ' novel' : ''}${stacked ? ' stacked' : ''}${work.type === 'app' ? ' phones' : ''}">${renderBlocks(blocks, String(work.title))}</article>` : ''}
${e.note ? `<aside class="note"><span>${kind === 'episode' ? '작가의 말' : '덧붙이는 말'}</span><p>${esc(e.note)}</p></aside>` : ''}
<nav class="pager">${nav(prev, kind === 'episode' ? '← 이전 화' : '← 이전 소식')}${nav(next, kind === 'episode' ? '다음 화 →' : '다음 소식 →')}</nav>
<div class="to-work"><a class="btn small" href="${workHref}#entries">${kind === 'episode' ? '전체 회차' : '전체 소식'}</a><a class="btn small" href="${workHref}#discussion">별점 · 댓글</a>${owner ? `<a class="btn small" href="${workHref}/e/${encodeURIComponent(entry)}/edit">${kind === 'episode' ? '이 회차 수정' : '이 소식 수정'}</a>` : ''}</div>${cta}${discussion}</main>
<script type="application/json" id="entry-config">${JSON.stringify({ id: entry, workId: id, loggedIn: !!user, mature }).replace(/</g, '\\u003c')}</script><script src="${asset('/social.js')}" defer></script><script src="${asset('/mobile-safety.js')}" defer></script><script src="${asset('/entry.js')}" defer></script>
<script>try{localStorage.setItem('vibeflix.read.'+${JSON.stringify(id)},${JSON.stringify(entry)});const k='vibeflix.recent',l=JSON.parse(localStorage.getItem(k)||'[]').filter(x=>x&&x.id!==${JSON.stringify(id)});l.unshift({id:${JSON.stringify(id)},at:Date.now(),entry:${JSON.stringify(entry)},label:${JSON.stringify(kind === 'episode' ? `${e.number}화` : entryLabel(e)).replace(/</g, '\\u003c')}});localStorage.setItem(k,JSON.stringify(l.slice(0,20)))}catch{}document.querySelectorAll('.body.phones img').forEach(i=>{const f=()=>{if(i.naturalHeight>i.naturalWidth*1.3)i.classList.add('portrait')};i.complete?f():i.onload=f;});</script>
</body></html>`;
  return htmlResponse(html);
}
