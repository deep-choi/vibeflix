import { db } from './api';
import { currentUser } from './auth';
import { entryKind } from './entries';
import { esc, formPageResponse, loginRedirect, messagePage } from './page-shell';
import { resolveContent } from './projects';

// 회차 쓰기 / 업데이트 소식 쓰기 (/works/:id/e/new, /works/:id/e/:entry/edit). public/entry-editor.js sends the form.
export async function entryFormPage(id: string, entryId = '') {
  const path = `/works/${encodeURIComponent(id)}/e/${entryId ? `${encodeURIComponent(entryId)}/edit` : 'new'}`;
  const user = await currentUser().catch(() => null);
  if (!user) return loginRedirect(path);
  const work = await db().prepare("SELECT title,type,hidden_at FROM projects WHERE id=? AND owner_id=? AND source='community' AND deleted_at IS NULL").bind(id, user.id).first();
  const manage = `/studio/works/${encodeURIComponent(id)}`;
  if (!work) return messagePage('작품을 찾을 수 없어요', '내가 올린 작품에만 회차와 소식을 쓸 수 있어요.', 404);
  if (work.hidden_at) return new Response(null, { status: 302, headers: { Location: `${manage}#settings`, 'Cache-Control': 'no-store' } });
  const kind = entryKind(String(work.type)); const episode = kind === 'episode';
  const row = entryId ? await db().prepare('SELECT * FROM entries WHERE id=? AND project_id=?').bind(entryId, id).first() : null;
  if (entryId && !row) return messagePage('회차를 찾을 수 없어요', '이미 삭제되었을 수 있어요.', 404, manage, '작품 관리로 돌아가기');
  const nextNumber = Number((await db().prepare('SELECT COALESCE(MAX(number),0)+1 AS n FROM entries WHERE project_id=?').bind(id).first())?.n || 1);
  const scheduled = !!row && Number(row.published_at) > Date.now();
  const noun = episode ? '회차' : '소식';
  const form = `<form id="entry-form" novalidate>
<section class="fp-section"><div class="entry-grid">${episode ? `<label>회차 <input name="number" type="number" min="1" max="9999" required value="${esc(row?.number ?? nextNumber)}"></label>` : `<label>버전 <small>선택</small><input name="version" maxlength="30" placeholder="예: 1.2.0" value="${esc(row?.version)}"></label>`}<label class="grow">제목 <span class="req" aria-hidden="true">*</span><input name="title" maxlength="100" required placeholder="${episode ? '예: 첫 번째 별' : '예: 다크 모드 추가'}" value="${esc(row?.title)}"></label></div></section>
<section class="fp-section"><h2>본문</h2><div id="entry-body"></div></section>
<section class="fp-section"><h2>${episode ? '작가의 말' : '덧붙이는 말'} <small>선택</small></h2><textarea name="note" maxlength="1000" rows="3" aria-label="${episode ? '작가의 말' : '덧붙이는 말'}">${esc(row?.note)}</textarea></section>
<section class="fp-section"><h2>공개 설정</h2><div class="entry-grid"><label>공개 <select name="status"><option value="published"${row?.status === 'draft' ? '' : ' selected'}>공개</option><option value="draft"${row?.status === 'draft' ? ' selected' : ''}>임시 저장</option></select></label><label class="grow">예약 공개 <small>비우면 지금 공개</small><input name="publishAt" type="datetime-local"></label></div></section>
<p class="form-error" id="entry-error" role="alert" hidden></p>
<div class="fp-bar">${row ? `<button type="button" class="btn danger" data-entry-delete>삭제</button>` : ''}<span class="fp-spacer"></span><a class="btn" href="${manage}#entries">취소</a><button class="btn primary" id="entry-submit">저장</button></div>
</form>`;
  return formPageResponse({
    title: `${row ? `${noun} 수정` : episode ? '새 회차 쓰기' : '업데이트 소식 쓰기'} · ${work.title}`,
    back: `${manage}#entries`, backLabel: '작품 관리로 돌아가기', kicker: String(work.title),
    heading: row ? `${noun} 수정` : episode ? '새 회차 쓰기' : '업데이트 소식 쓰기', form,
    config: { id, kind, entryId, publishAt: scheduled ? Number(row!.published_at) : 0, content: row ? resolveContent(row.content) : [], hint: episode ? '이번 화의 글과 그림을 순서대로 넣어주세요.' : '바뀐 점을 글로 정리하고, 필요하면 스크린샷을 넣어주세요.' },
    scripts: ['/entry-editor.js'], blockEditor: true,
  });
}
