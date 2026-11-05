import { currentUser } from '../../../lib/auth';
import { loginRedirect } from '../../../lib/page-shell';
import { workFormPage } from '../../../lib/work-form';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await currentUser().catch(() => null);
  if (!user) return loginRedirect(`/works/new${url.search}`);
  return workFormPage(user, '', null, url.searchParams.get('type') || '');
}
