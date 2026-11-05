import { currentUser } from '../../../lib/auth';
import { loginRedirect } from '../../../lib/page-shell';
import { studioPage, studioWorks, uploadTypes, workRow, workState } from '../../../lib/studio';

export const dynamic = 'force-dynamic';
const FILTERS: [string, string][] = [['public', '공개 중'], ['upcoming', '개발 중'], ['draft', '임시 저장'], ['hidden', '숨겨짐'], ['removed', '내림']];

export async function GET() {
  const user = await currentUser().catch(() => null);
  if (!user) return loginRedirect('/studio/works');
  const works = await studioWorks(user.id);
  const count = (state: string) => works.filter(w => workState(w) === state).length;
  const chips = FILTERS.filter(([state]) => count(state)).map(([state, label]) => `<button type="button" class="chip-btn" data-work-filter="${state}">${label} ${count(state)}</button>`).join('');
  const body = `<header class="st-head"><h1>내 작품</h1><p>올린 작품을 고치고, 숫자를 보고, 공개 상태를 바꿔요.</p></header>${works.length
    ? `<div class="st-filters" role="group" aria-label="작품 상태"><button type="button" class="chip-btn" data-work-filter="" aria-current="true">전체 ${works.length}</button>${chips}</div><ul class="st-works">${works.map(workRow).join('')}</ul>`
    : `<section class="st-card st-empty"><h2>아직 올린 작품이 없어요.</h2><p class="muted">AI로 만든 것이라면 무엇이든 올릴 수 있어요.</p><div class="st-types">${uploadTypes()}</div></section>`}`;
  return studioPage({ title: '내 작품', active: 'works', user, body });
}
