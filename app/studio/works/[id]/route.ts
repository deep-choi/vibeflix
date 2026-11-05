import { db } from '../../../../lib/api';
import { currentUser } from '../../../../lib/auth';
import { entryKind, entryLabel, listEntries } from '../../../../lib/entries';
import { esc, fmtDate, loginRedirect, messagePage, typeNames } from '../../../../lib/page-shell';
import { COVER_SQL, editHref, followerCount, stateBadge, studioPage, workCover, workInsights, workState } from '../../../../lib/studio';
import { workStats } from '../../../../lib/stats';

// One work's management page: numbers, episodes or update notes, feedback, and whether it is public.
export const dynamic = 'force-dynamic';
const stat = (label: string, value: unknown) => `<div><span>${label}</span><b>${esc(value)}</b></div>`;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await currentUser().catch(() => null);
  if (!user) return loginRedirect(`/studio/works/${encodeURIComponent(id)}`);
  const work = await db().prepare(`SELECT p.id,p.title,p.type,p.status,p.visibility,p.hidden_at,p.deleted_at,p.created,${COVER_SQL} AS image FROM projects p WHERE p.id=? AND p.owner_id=? AND p.source='community'`).bind(id, user.id).first();
  if (!work) return messagePage('작품을 찾을 수 없어요', '내가 올린 작품만 여기서 관리할 수 있어요.', 404, '/studio/works', '내 작품으로 가기');

  const state = workState(work), kind = entryKind(String(work.type)), episode = kind === 'episode';
  const workHref = `/works/${encodeURIComponent(id)}`;
  const [stats, entries, followers] = await Promise.all([workStats(id), listEntries(id, kind, true), followerCount(user.id)]);
  const editable = state !== 'hidden' && state !== 'removed', discussable = state === 'public' || state === 'upcoming';
  const published = entries.filter(e => e.status === 'published' && !e.scheduled);
  const rows = entries.map(e => { const href = `${workHref}/e/${encodeURIComponent(String(e.id))}`; const badge = e.status === 'draft' ? '<em class="chip">임시 저장</em>' : e.scheduled ? `<em class="chip">예약 · ${fmtDate(e.published_at)}</em>` : ''; return `<li><a href="${editable ? `${href}/edit` : href}"><b>${esc(entryLabel(e))}</b><span>${badge}${fmtDate(e.published_at)}</span></a></li>`; }).join('');
  const settings = state === 'hidden' ? `<p>운영자가 확인 중이라 공개 화면에 보이지 않고 수정할 수 없어요. 숨긴 이유와 다르다면 다시 확인을 요청할 수 있어요.</p><a class="btn" href="/#appeal=project:${encodeURIComponent(id)}">이의 제기하기</a>`
    : state === 'removed' ? `<p>공개 목록에서 내린 작품이에요. 다시 공개하면 바로 방문자에게 보여요.</p><button class="btn primary" data-restore-work>다시 공개하기</button>`
    : state === 'draft' ? `<p>임시 저장된 작품이라 나만 볼 수 있어요.</p><a class="btn primary" href="${editHref(id)}">이어서 쓰고 공개하기</a>`
    : `<p>공개 목록에서 내려도 작품은 지워지지 않고, 여기서 언제든 다시 공개할 수 있어요.</p><button class="btn danger" data-remove-work>공개 목록에서 내리기</button>`;
  const updates = kind === 'update' ? published.map(e => ({ id: String(e.id), label: entryLabel(e) })) : [];

  const body = `<header class="st-work-head"><a class="link" href="/studio/works">← 내 작품</a><div class="st-work-top"><div class="st-cover">${workCover(work)}</div><div><h1>${esc(work.title)}</h1><p>${esc(typeNames[String(work.type)] || '')} · ${fmtDate(work.created)} ${stateBadge(state)}</p><div class="st-work-buttons">${state === 'removed' ? '' : `<a class="btn small" href="${workHref}">작품 페이지 보기</a>`}${editable ? `<a class="btn small primary" href="${editHref(id)}">작품 정보 수정</a>` : ''}</div></div></div></header>
<div class="fp-layout"><nav class="fp-nav" aria-label="작품 관리"><a href="#stats">통계</a><a href="#entries">${episode ? '회차' : '업데이트 소식'}</a><a href="#feedback">피드백</a><a href="#settings">공개 설정</a></nav><div>
<section class="fp-section" id="stats"><h2>통계</h2><div class="owner-stats">${stat('조회 (7일)', stats.views7)}${stat('조회 (30일)', stats.views30)}${stat('링크 클릭 (30일)', stats.clicks30)}${stat('찜', stats.saves)}${stat('팔로워', followers)}</div>${workInsights(stats, entries, kind)}</section>
<section class="fp-section" id="entries"><div class="st-card-head"><h2>${episode ? '회차' : '업데이트 소식'}</h2>${editable ? `<a class="btn small primary" href="${workHref}/e/new">＋ ${episode ? '새 회차 쓰기' : '소식 쓰기'}</a>` : ''}</div>${rows ? `<ol class="entry-list ${kind}">${rows}</ol>` : `<p class="muted">${episode ? '아직 회차가 없어요.' : '아직 업데이트 소식이 없어요.'}</p>`}</section>
<section class="fp-section discussion" id="feedback"><div class="section-title st-title"><h2>피드백</h2><span data-comment-count></span></div>${discussable ? '<div id="comments"></div>' : '<p class="muted">공개된 작품에 달린 댓글을 여기서 확인하고 답할 수 있어요.</p>'}</section>
<section class="fp-section st-settings" id="settings"><h2>공개 설정</h2>${settings}</section>
</div></div>`;
  return studioPage({ title: String(work.title), active: 'works', user, body, sections: true, config: { id, discussable, labels: ['app', 'game', 'website'].includes(String(work.type)), updates } });
}
