import { db } from './api';
import type { Member } from './auth';
import { esc, formPageResponse } from './page-shell';

// 이야기 쓰기 / 수정 (/posts/new, /posts/:id/edit). public/post-editor.js sends the form.
export const POST_LABELS: Record<string, string> = { general: '자유 이야기', showcase: '작품 소개', buildlog: '개발 일지', question: '질문', feedback: '피드백' };
const CATEGORY_OPTIONS: [string, string][] = [['general', '자유 이야기'], ['showcase', '작품 소개'], ['buildlog', '개발 일지'], ['question', '질문'], ['feedback', '피드백 요청']];

export type PostDraft = { id?: string; title: string; body: string; category: string; projectId: string };

export async function postFormPage(user: Member, post: PostDraft, editing: boolean, prefilled: boolean) {
  // my own works first: this is usually where a story comes from
  const works = await db().prepare("SELECT id,title,owner_id=? AS mine FROM projects WHERE deleted_at IS NULL AND hidden_at IS NULL AND visibility='public' ORDER BY mine DESC,title LIMIT 1000").bind(user.id).all();
  const option = (w: Record<string, unknown>) => `<option value="${esc(w.id)}"${w.id === post.projectId ? ' selected' : ''}>${esc(w.title)}</option>`;
  const mine = works.results.filter(w => w.mine), others = works.results.filter(w => !w.mine);
  const options = `${mine.length ? `<optgroup label="내 작품">${mine.map(option).join('')}</optgroup>` : ''}${others.length ? `<optgroup label="다른 작품">${others.map(option).join('')}</optgroup>` : ''}`;
  const form = `<form id="post-form">
<section class="fp-section">
<div class="form-pair"><label>어떤 이야기인가요?<select name="category">${CATEGORY_OPTIONS.map(([v, l]) => `<option value="${v}"${post.category === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label>함께 소개할 작품 <small>선택</small><select name="projectId"><option value="">작품 연결 없이 작성</option>${options}</select></label></div>
<label>제목 <span class="req" aria-hidden="true">*</span><input name="title" required minlength="2" maxlength="120" placeholder="이야기의 시작을 적어주세요." value="${esc(post.title)}"></label>
<label>본문 <span class="req" aria-hidden="true">*</span><textarea name="body" rows="16" required minlength="2" maxlength="12000" placeholder="어떤 것을 만들었나요? 무엇이 궁금한가요? 자유롭게 나눠주세요.">${esc(post.body)}</textarea></label>
</section>
<p class="form-error" id="post-form-error" role="alert" hidden></p>
<div class="fp-bar"><small class="draft-status" id="draft-status">${editing ? '수정 내용을 저장하면 기존 게시글에 반영됩니다.' : '새 글의 초안은 이 브라우저에 자동 저장됩니다.'}</small><a class="btn" href="${editing ? `/posts/${encodeURIComponent(String(post.id))}` : '/#community'}">취소</a><button class="btn primary" id="post-submit">${editing ? '수정 내용 저장하기' : '이야기 공개하기 ↗'}</button></div>
</form>`;
  return formPageResponse({
    title: editing ? '이야기 수정' : '이야기 쓰기',
    back: editing ? `/posts/${encodeURIComponent(String(post.id))}` : '/#community', backLabel: editing ? '글로 돌아가기' : '커뮤니티로 돌아가기',
    kicker: 'EVERY BUILD HAS A STORY', heading: editing ? '이야기를 다듬어주세요.' : '당신의 이야기를 들려주세요.', form,
    config: { id: post.id || '', draftKey: editing || prefilled ? '' : `vibeflix.post-draft.${user.publicId}` }, scripts: ['/post-editor.js'],
  });
}
