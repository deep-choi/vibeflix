import { currentUser } from '../../lib/auth';
import { esc, fmtDate, loginRedirect } from '../../lib/page-shell';
import { editHref, entryName, followerCount, manageHref, scheduledEntries, studioPage, studioWorks, uploadTypes, workRow, workState } from '../../lib/studio';

// 내 스튜디오 개요: open to every member. With no works yet it is the place to start; with works, numbers and what needs a look.
export const dynamic = 'force-dynamic';
const stat = (label: string, value: unknown) => `<div><span>${label}</span><b>${esc(value)}</b></div>`;

export async function GET() {
  const user = await currentUser().catch(() => null);
  if (!user) return loginRedirect('/studio');
  const works = await studioWorks(user.id);
  if (!works.length) return studioPage({ title: '개요', active: 'home', user, body: `<section class="st-welcome"><span class="ds-kicker">YOUR STUDIO</span><h1>AI로 만든 작품을 올려보세요.</h1><p>완성작이 아니어도 괜찮아요. 웹사이트, 게임, 앱, 그림, 영상, 소설까지 언제든 올리고 여기서 관리할 수 있어요.</p><a class="btn primary large" href="/works/new">＋ 첫 작품 올리기</a><div class="st-types"><span>무엇을 만드셨나요?</span>${uploadTypes()}</div></section>` });

  const [followers, scheduled] = await Promise.all([followerCount(user.id), scheduledEntries(user.id)]);
  const live = works.filter(w => workState(w) !== 'removed');
  const sum = (key: 'views30' | 'clicks30' | 'saves') => live.reduce((n, w) => n + Number(w[key] || 0), 0);
  const todo: string[] = [];
  for (const w of live) {
    const state = workState(w), name = esc(w.title);
    if (state === 'hidden') todo.push(`<li><a href="${manageHref(w.id)}#settings"><b>${name}</b><span>운영자가 숨긴 작품 · 이의 제기</span></a></li>`);
    if (state === 'draft') todo.push(`<li><a href="${editHref(w.id)}"><b>${name}</b><span>임시 저장 · 이어서 쓰기</span></a></li>`);
    if (Number(w.open_feedback) > 0 && state !== 'hidden') todo.push(`<li><a href="${manageHref(w.id)}#feedback"><b>${name}</b><span>새 피드백·버그 제보 ${Number(w.open_feedback)}개</span></a></li>`);
  }
  for (const e of scheduled) todo.push(`<li><a href="/works/${encodeURIComponent(String(e.project_id))}/e/${encodeURIComponent(String(e.id))}/edit"><b>${esc(e.work_title)} · ${esc(entryName(e))}</b><span>${fmtDate(e.published_at)} 예약 공개</span></a></li>`);

  return studioPage({ title: '개요', active: 'home', user, body: `<header class="st-head"><h1>개요</h1><p>최근 30일 기준이에요.</p></header>
<div class="owner-stats st-stats">${stat('조회', sum('views30'))}${stat('링크 클릭', sum('clicks30'))}${stat('찜', sum('saves'))}${stat('팔로워', followers)}</div>
<section class="st-card"><h2>확인할 일</h2>${todo.length ? `<ul class="st-todo">${todo.slice(0, 12).join('')}</ul>` : '<p class="muted">지금 확인할 일이 없어요.</p>'}</section>
<section class="st-card"><div class="st-card-head"><h2>최근 작품</h2><a class="link" href="/studio/works">전체 ${works.length}개 보기</a></div><ul class="st-works">${works.slice(0, 5).map(workRow).join('')}</ul></section>` });
}
