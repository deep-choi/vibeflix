import { env } from 'cloudflare:workers';
import { currentUser, requireUser } from '../../../../lib/auth';
import { parseProject, sameOrigin } from '../../../../lib/project-input';
import { body, db, failure, json, limit, origin, ApiError } from '../../../../lib/api';
import catalog from '../../../../public/catalog.json';

export const dynamic = 'force-dynamic';
export async function DELETE(request: Request, context: { params: Promise<{id:string}> }) {
  if (!sameOrigin(request)) return Response.json({error:'올바른 사이트에서 다시 시도해주세요.'},{status:403});
  const user=await currentUser();
  if (!user) return Response.json({error:'로그인이 필요합니다.'},{status:401});
  const {id}=await context.params;
  try {
    const result=await env.DB!.prepare('UPDATE projects SET deleted_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL RETURNING id').bind(Date.now(),id,user.id).all();
    if(!result.results.length)return Response.json({error:'작품을 찾을 수 없거나 수정 권한이 없습니다.'},{status:404});
    return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  } catch { return Response.json({error:'지금은 작품을 내릴 수 없습니다. 잠시 후 다시 시도해주세요.'},{status:503}); }
}

export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
  try{origin(request);const user=await requireUser();await limit(user.id,'edit-project',20);const {id}=await context.params;const existing=await db().prepare('SELECT * FROM projects WHERE id=? AND owner_id=?').bind(id,user.id).first();if(!existing)throw new ApiError(404,'수정할 작품을 찾을 수 없습니다.');const b=await body(request);
    if(existing.hidden_at)throw new ApiError(403,'운영자가 확인 중인 작품은 직접 다시 공개할 수 없습니다.');
    if(b.restore===true){await db().prepare('UPDATE projects SET deleted_at=NULL WHERE id=? AND owner_id=? AND hidden_at IS NULL').bind(id,user.id).run();return json({ok:true});}
    const parsed=parseProject({...b,creator:user.name});if(!parsed)throw new ApiError(400,'작품 정보를 확인해주세요.');if(catalog.some(p=>p.url&&new URL(p.url).origin===new URL(parsed.url).origin))throw new ApiError(409,'이미 소개 중인 서비스입니다.');
    await db().prepare('UPDATE projects SET title=?,description=?,creator=?,type=?,url=?,image=? WHERE id=? AND owner_id=? AND deleted_at IS NULL').bind(parsed.title,parsed.description,user.name,parsed.type,parsed.url,parsed.image,id,user.id).run();return json({ok:true});
  }catch(error){if(error instanceof Error&&error.message.includes('UNIQUE'))return json({error:'이미 등록된 링크입니다.'},409);return failure(error);}
}
