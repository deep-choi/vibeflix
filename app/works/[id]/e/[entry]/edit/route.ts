import { entryFormPage } from '../../../../../../lib/entry-form';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string; entry: string }> }) {
  const { id, entry } = await context.params;
  return entryFormPage(id, entry);
}
