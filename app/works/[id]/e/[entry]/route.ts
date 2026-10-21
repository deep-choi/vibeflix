import { db } from '../../../../../lib/api';
import { blockedOwners } from '../../../../../lib/member-safety';
import { currentUser } from '../../../../../lib/auth';
import { entryKind, entryLabel, listEntries } from '../../../../../lib/entries';
import { resolveContent } from '../../../../../lib/projects';
import { BASE_CSS, esc, fmtDate, htmlResponse, pageHead, renderBlocks, topBar, type ViewBlock } from '../../../../../lib/page-shell';

// One episode or update note: title, body, the author's note, and previous/next navigation.
export const dynamic = 'force-dynamic';
const notFound = () => new Response('회차를 찾을 수 없어요.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export async function GET(_request: Request, context: { params: Promise<{ id: string; entry: string }> }) {
  const { id, entry } = await context.params;
  const work = await db().prepare('SELECT id,owner_id,title,type,details,visibility,hidden_at,source FROM projects WHERE id=? AND deleted_at IS NULL').bind(id).first().catch(() => null);
  const user = await currentUser().catch(() => null);
  if(work && (await blockedOwners(user?.id)).has(String(work.owner_id)))return new Response('차단한 이용자의 콘텐츠입니다.',{status:404});
  const owner = !!work && !!user && user.id === work.owner_id && work.source === 'community';
  if (!work || ((work.hidden_at || work.visibility !== 'public') && !owner)) return notFound();
  const e = await db().prepare('SELECT * FROM entries WHERE id=? AND project_id=?').bind(entry, id).first();
  if (!e || (!owner && (e.status !== 'published' || Number(e.published_at) > Date.now()))) return notFound();
  const kind = entryKind(String(work.type)); const all = await listEntries(id, kind, owner);
  const i = all.findIndex(x => x.id === entry); const prev = kind === 'episode' ? all[i - 1] : all[i + 1]; const next = kind === 'episode' ? all[i + 1] : all[i - 1];
  let details: Record<string, unknown> = {}; try { details = JSON.parse(String(work.details || '{}')); } catch {}
  const blocks: ViewBlock[] = resolveContent(e.content).map(b => b.type === 'image' ? { type: 'image', src: b.src, caption: b.caption } : b);
  const stacked = work.type === 'art' && (details.format === 'webtoon' || details.format === 'comic');
  const workHref = `/works/${encodeURIComponent(id)}`; const href = (x?: { id: string }) => x ? `${workHref}/e/${encodeURIComponent(x.id)}` : '';
  const nav = (x: typeof prev, label: string) => x ? `<a href="${href(x)}"><span>${label}</span><b>${esc(entryLabel(x))}</b></a>` : '<span></span>';
  const status = e.status === 'draft' ? '임시 저장 · 나만 볼 수 있어요' : Number(e.published_at) > Date.now() ? `예약 공개 · ${fmtDate(e.published_at)}` : '';
  const html = `${pageHead(`${entryLabel(e)} · ${work.title}`, work.visibility !== 'public' || status ? '<meta name="robots" content="noindex">' : '')}
<style>${BASE_CSS}
.crumb{font-size:13.5px;color:#9a9a9a}.crumb a{color:var(--lime)}h1{margin:10px 0 6px;font-size:clamp(28px,4.4vw,44px);line-height:1.2;letter-spacing:-1px;color:#fff}.date{color:#8d8d8d;font-size:14px}
.note{max-width:760px;margin:40px auto 0;padding:18px 20px;border-radius:12px;background:var(--panel);border:1px solid var(--line)}.note span{display:block;font-size:12px;font-weight:600;color:#8d8d8d;margin-bottom:6px}.note p{margin:0;white-space:pre-line}
.pager{max-width:760px;margin:48px auto 0;display:grid;grid-template-columns:1fr 1fr;gap:12px}.pager a{display:block;padding:16px 18px;border-radius:12px;background:var(--panel);border:1px solid var(--line)}.pager a:hover{border-color:#ffffff40}.pager a:last-child{text-align:right}.pager span{display:block;font-size:12px;color:#8d8d8d}.pager b{display:block;margin-top:4px;color:#fff;font-size:15px}
.to-work{display:flex;justify-content:center;gap:10px;margin-top:28px}</style></head><body>
${topBar(workHref, '작품으로 돌아가기')}${status ? `<div class="notice">${esc(status)}</div>` : ''}
<main><p class="crumb"><a href="${workHref}">${esc(work.title)}</a> · ${kind === 'episode' ? '회차' : '업데이트 소식'}</p><h1>${esc(entryLabel(e))}</h1><p class="date">${fmtDate(e.published_at)}</p>
${blocks.length ? `<article class="body${work.type === 'novel' ? ' novel' : ''}${stacked ? ' stacked' : ''}${work.type === 'app' ? ' phones' : ''}">${renderBlocks(blocks, String(work.title))}</article>` : ''}
${e.note ? `<aside class="note"><span>${kind === 'episode' ? '작가의 말' : '덧붙이는 말'}</span><p>${esc(e.note)}</p></aside>` : ''}
<nav class="pager">${nav(prev, kind === 'episode' ? '← 이전 화' : '← 이전 소식')}${nav(next, kind === 'episode' ? '다음 화 →' : '다음 소식 →')}</nav>
<div class="to-work"><a class="btn small" href="${workHref}#entries">${kind === 'episode' ? '전체 회차' : '전체 소식'}</a><a class="btn small" href="${workHref}#discussion">별점 · 댓글</a></div></main>
<script>try{localStorage.setItem('vibeflix.read.'+${JSON.stringify(id)},${JSON.stringify(entry)})}catch{}document.querySelectorAll('.body.phones img').forEach(i=>{const f=()=>{if(i.naturalHeight>i.naturalWidth*1.3)i.classList.add('portrait')};i.complete?f():i.onload=f;});</script>
</body></html>`;
  return htmlResponse(html);
}
