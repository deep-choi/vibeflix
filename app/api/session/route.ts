import { getChatGPTUser } from '../../chatgpt-auth';

export const dynamic = 'force-dynamic';
export async function GET() {
  const user = await getChatGPTUser();
  return Response.json({ user: user ? { id: user.userId, name: user.fullName || '크리에이터' } : null }, { headers: { 'Cache-Control':'no-store' } });
}
