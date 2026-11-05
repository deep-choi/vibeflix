import { entryFormPage } from '../../../../../lib/entry-form';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return entryFormPage((await context.params).id);
}
