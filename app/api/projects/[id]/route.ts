import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { sameOrigin } from '../../../../lib/project-input';

export const dynamic = 'force-dynamic';
export async function DELETE(request: Request, context: { params: Promise<{id:string}> }) {
  if (!sameOrigin(request)) return Response.json({error:'올바른 사이트에서 다시 시도해주세요.'},{status:403});
  const user=await getChatGPTUser();
  if (!user) return Response.json({error:'로그인이 필요합니다.'},{status:401});
  const {id}=await context.params;
  try {
    const result=await env.DB!.prepare('UPDATE projects SET deleted_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL RETURNING id').bind(Date.now(),id,user.userId).all();
    if(!result.results.length)return Response.json({error:'작품을 찾을 수 없거나 수정 권한이 없습니다.'},{status:404});
    return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  } catch { return Response.json({error:'지금은 작품을 내릴 수 없습니다. 잠시 후 다시 시도해주세요.'},{status:503}); }
}
