import { db } from '../../../lib/api';
import { currentUser } from '../../../lib/auth';
import { loginRedirect } from '../../../lib/page-shell';
import { postFormPage } from '../../../lib/post-form';

// ?feedback=<work> starts a 피드백 요청 post about that work (offered after a first upload); ?project=<work> just links it.
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await currentUser().catch(() => null);
  if (!user) return loginRedirect(`/posts/new${url.search}`);
  const linked = url.searchParams.get('feedback') || url.searchParams.get('project') || '';
  const work = linked ? await db().prepare("SELECT id,title FROM projects WHERE id=? AND deleted_at IS NULL AND hidden_at IS NULL AND visibility='public'").bind(linked).first() : null;
  const feedback = !!work && url.searchParams.has('feedback');
  return postFormPage(user, {
    title: feedback ? `[피드백 요청] ${work.title}`.slice(0, 120) : '',
    body: feedback ? '처음으로 작품을 올렸어요. 써보고 솔직한 의견을 들려주세요!\n\n특히 궁금한 점:\n- \n- \n\n작품 링크는 아래 ‘함께 소개한 작품’에서 볼 수 있어요.' : '',
    category: feedback ? 'feedback' : 'general', projectId: work ? String(work.id) : '',
  }, false, !!work);
}
