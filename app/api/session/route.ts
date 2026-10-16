import { currentUser, publicMember } from '../../../lib/auth';
import { failure, json } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export async function GET() {
  try { const user = await currentUser(); return json({user:user?publicMember(user):null}); } catch(error){return failure(error);}
}
