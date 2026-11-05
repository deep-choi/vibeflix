import type { Member } from './auth';
import { genreTaxonomy } from './project-input';
import { esc, formPageResponse } from './page-shell';

// The 작품 올리기 / 수정 page: a name, a kind, a link and one free-writing section. Everything else is optional and folded away.
// public/work-editor.js sends the form. The nickname is the signed-in member's own and is never typed here.
export type WorkDraft = { title: string; type: string; url: string; description: string; status: string; genres: string[]; details: Record<string, unknown>; content: unknown[]; image: string; draft: boolean };

const CATEGORIES: [string, string][] = [['website', '웹사이트'], ['game', '게임'], ['app', '앱'], ['art', '그림 · 만화 · 일러스트'], ['video', '영상'], ['novel', '소설']];
const REQUIRED = '<span class="req" aria-hidden="true">*</span>';

export function workFormPage(user: Member, id = '', work: WorkDraft | null = null, presetType = '') {
  const editing = !!work; const published = editing && !work.draft;
  const hasExtras = !!work && (work.genres.length > 0 || (Array.isArray(work.details.warnings) && work.details.warnings.includes('mature')));
  const form = `<form id="work-form">
<section class="fp-section">
<label>작품 이름 ${REQUIRED}<input name="title" required maxlength="60" placeholder="어떤 작품을 만드셨나요?" value="${esc(work?.title)}"></label>
<label>종류 ${REQUIRED}<select name="type" required>${CATEGORIES.map(([v, l]) => `<option value="${v}"${(work?.type ?? presetType) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
<label id="url-field"><span id="url-label">작품 링크</span> <span class="req" id="url-required" aria-hidden="true">*</span><input name="url" type="text" inputmode="url" autocapitalize="off" autocomplete="url" spellcheck="false" maxlength="2000" value="${esc(work?.url)}"><small class="field-hint" id="url-hint"></small></label>
<label class="consent-line"><input type="checkbox" id="work-upcoming"${work?.status === 'upcoming' ? ' checked' : ''}> 아직 개발 중이에요 <small>링크 없이 먼저 알리고, 공개하는 날 찜한 사람에게 알림이 가요</small></label>
</section>
<section class="fp-section" id="intro"><h2>작품 소개 ${REQUIRED}</h2>
<p class="gallery-hint">어떤 작품인지, 어떻게 만들었는지 편하게 써주세요. 사용한 AI 도구나 걸린 시간 같은 이야기도 여기에 적으면 돼요. 사진과 영상은 아래에서 더할 수 있어요.</p>
<div id="content-editor"></div>
</section>
<section class="fp-section" id="cover"><h2>커버 이미지 <small>선택</small></h2>
<input type="file" id="cover-file" class="sr-only" accept="image/png,image/jpeg,image/webp" tabindex="-1">
<div class="cover-row"><div class="cover-preview" id="cover-preview" hidden><img alt="커버 이미지 미리보기"></div><div class="cover-side"><div class="cover-actions"><button type="button" class="btn small" id="cover-pick">이미지 선택</button><button type="button" class="btn small link" id="cover-clear" data-guard-click hidden>삭제</button></div><p class="gallery-hint" id="cover-info">16:9로 잘라 카드와 작품 페이지 맨 위에 보여줘요.</p></div></div>
<p class="form-error" id="cover-error" role="alert" hidden></p>
</section>
<details class="fp-more" id="more"${hasExtras ? ' open' : ''}><summary>더 설정하기 <small>선택 · 장르, 성인 소재</small></summary>
<div class="genre-field"><span class="cover-label">장르 <small>최대 3개 · 카테고리 페이지에서 장르별로 묶여 보여요</small></span><div class="genre-chips" id="work-genres" role="group" aria-label="장르 선택"></div></div>
<label class="consent-line" id="mature-line" hidden><input type="checkbox" id="work-mature"> 성인 소재가 포함돼 있어요 <small>방문자에게 확인을 받은 뒤 보여줘요</small></label>
</details>
<p class="form-error" id="form-error" role="alert" hidden></p>
<div class="fp-bar"><small class="form-footnote">${published ? '저장하면 바로 공개 화면에 반영돼요.' : '등록하면 작품마다 상세 페이지가 만들어져요.'}</small>${published ? '' : '<button type="button" class="btn" id="save-draft">임시 저장</button>'}<button type="submit" class="btn primary" id="work-submit">${published ? '수정 내용 저장하기' : '공개 등록하기 ↗'}</button></div>
</form>`;
  return formPageResponse({
    title: editing ? `${work.title} 수정` : '작품 올리기',
    back: editing ? `/studio/works/${encodeURIComponent(id)}` : '/studio', backLabel: editing ? '작품 관리로 돌아가기' : '내 스튜디오로 돌아가기',
    kicker: 'LET YOUR VIBE OUT', heading: editing ? '작품 소개를 다듬어주세요.' : '작품을 소개해주세요.',
    form, config: { id, published, genres: genreTaxonomy, work, creator: user.name }, scripts: ['/work-editor.js'], blockEditor: true,
  });
}
