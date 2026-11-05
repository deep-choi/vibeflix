import type { Member } from './auth';
import { genreTaxonomy } from './project-input';
import { esc, formPageResponse } from './page-shell';

// The 작품 올리기 / 수정 page. public/work-editor.js fills in the category fields and sends the form.
export type WorkDraft = { title: string; type: string; url: string; description: string; status: string; genres: string[]; details: Record<string, unknown>; content: unknown[]; image: string; draft: boolean };

const CATEGORIES: [string, string][] = [['website', '웹사이트'], ['game', '게임'], ['app', '앱'], ['art', '그림 · 만화 · 일러스트'], ['video', '영상'], ['novel', '소설']];
const REQUIRED = '<span class="req" aria-hidden="true">*</span>';

export function workFormPage(user: Member, id = '', work: WorkDraft | null = null, presetType = '') {
  const editing = !!work; const published = editing && !work.draft;
  const form = `<form id="work-form">
<section class="fp-section" id="basic"><h2>기본 정보</h2>
<label>작품 이름 ${REQUIRED}<input name="title" required maxlength="60" placeholder="어떤 작품을 만드셨나요?" value="${esc(work?.title)}"></label>
<div class="form-pair"><label>카테고리 ${REQUIRED}<select name="type" required>${CATEGORIES.map(([v, l]) => `<option value="${v}"${(work?.type ?? presetType) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label>크리에이터 <small>내 닉네임으로 공개돼요</small><input name="creator" required maxlength="40" readonly value="${esc(user.name)}"></label></div>
<div class="genre-field"><span class="cover-label">장르 <small>선택 · 최대 3개 · 카테고리 페이지에서 장르별로 묶여 보여요</small></span><div class="genre-chips" id="work-genres" role="group" aria-label="장르 선택"></div></div>
</section>
<section class="fp-section" id="status"><h2>상태와 링크</h2>
<label>지금 상태 <select name="status" id="work-status"><option value="live"${work?.status === 'upcoming' ? '' : ' selected'}>완성했어요 · 바로 써볼 수 있어요</option><option value="upcoming"${work?.status === 'upcoming' ? ' selected' : ''}>개발 중이에요 · 링크 없이 먼저 알릴래요</option></select><small class="field-hint" id="status-hint">개발 중으로 올리면 ‘곧 공개됩니다’에 나오고, 찜한 사람에게 공개하는 날 알림이 가요.</small></label>
<label id="url-field"><span id="url-label">작품 링크</span> <span class="req" id="url-required" aria-hidden="true">*</span><input name="url" type="text" inputmode="url" autocapitalize="off" autocomplete="url" spellcheck="false" maxlength="2000" value="${esc(work?.url)}"><small class="field-hint" id="url-hint"></small></label>
</section>
<section class="fp-section" id="intro"><h2>작품 소개</h2>
<label>소개 글 ${REQUIRED}<textarea name="description" id="work-description" required maxlength="1000" rows="7" placeholder="카드와 상세 페이지 맨 위에 보이는 소개예요. 긴 내용은 아래 본문에 써주세요.">${esc(work?.description)}</textarea></label>
<div class="fp-row"><span class="intro-help">무엇을 써야 할지 막막하다면 <button type="button" class="text-button" id="intro-template">소개 틀 넣기</button></span><span class="char-count"><span id="description-count">0</span> / 1,000자</span></div>
</section>
<section class="fp-section" id="cover"><h2>커버 이미지 <small>선택</small></h2>
<p class="gallery-hint">아무 이미지나 올리면 16:9로 잘라 1280×720으로 맞춰요. 카드와 상세 페이지 맨 위에 보여요.</p>
<input type="file" id="cover-file" class="sr-only" accept="image/png,image/jpeg,image/webp" tabindex="-1">
<div class="cover-actions"><button type="button" class="btn" id="cover-pick">내 컴퓨터에서 이미지 선택</button><button type="button" class="btn link" id="cover-clear" data-guard-click hidden>이미지 삭제</button></div>
<div class="cover-preview" id="cover-preview" hidden><img alt="커버 이미지 미리보기"><span id="cover-info"></span></div>
<p class="form-error" id="cover-error" role="alert" hidden></p>
</section>
<section class="fp-section" id="details"><h2>세부 정보 <small>선택</small></h2><p class="gallery-hint">기술과 AI 도구, 함께 만든 사람, 연재 정보를 적으면 작품 페이지에 함께 소개돼요.</p><div id="work-details"></div></section>
<section class="fp-section" id="body"><h2>본문 <small>선택</small></h2><p class="gallery-hint">상세 페이지에서 위에서 아래로 이어서 보여요. 연재는 등록 후 작품 페이지에서 회차를 올려요.</p><div id="content-editor"></div></section>
<p class="form-error" id="form-error" role="alert" hidden></p>
<div class="fp-bar"><small class="form-footnote">${published ? '저장하면 바로 공개 화면에 반영돼요.' : '등록하면 작품마다 상세 페이지가 만들어져요.'}</small>${published ? '' : '<button type="button" class="btn" id="save-draft">임시 저장</button>'}<button type="submit" class="btn primary" id="work-submit">${published ? '수정 내용 저장하기' : '공개 등록하기 ↗'}</button></div>
</form>`;
  return formPageResponse({
    title: editing ? `${work.title} 수정` : '작품 올리기',
    back: editing ? `/studio/works/${encodeURIComponent(id)}` : '/studio', backLabel: editing ? '작품 관리로 돌아가기' : '내 스튜디오로 돌아가기',
    kicker: 'LET YOUR VIBE OUT', heading: editing ? '작품 소개를 다듬어주세요.' : '당신의 작품을 소개해주세요.',
    lead: editing ? undefined : '작은 아이디어도 누군가에겐 새로운 발견이니까. 등록한 작품은 모든 방문자에게 공개됩니다.',
    sections: [['basic', '기본 정보'], ['status', '상태와 링크'], ['intro', '작품 소개'], ['cover', '커버 이미지'], ['details', '세부 정보'], ['body', '본문']],
    form, config: { id, published, genres: genreTaxonomy, work }, scripts: ['/work-editor.js'], blockEditor: true,
  });
}
