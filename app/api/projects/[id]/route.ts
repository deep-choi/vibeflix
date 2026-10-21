import { env } from 'cloudflare:workers';
import { currentUser, requireUser } from '../../../../lib/auth';
import { parseProject, parseCover, parseContent, projectProblem, sameOrigin, CONTENT, COVER, GALLERY, PROJECT_BODY_LIMIT } from '../../../../lib/project-input';
import { body, db, failure, json, limit, origin, ApiError } from '../../../../lib/api';
import { contentStatements, isCuratedOrigin, resolveContent } from '../../../../lib/projects';

import { assertVisibleAuthor } from '../../../../lib/member-safety';
export const dynamic = 'force-dynamic';

/** Full work for the editor: details and body blocks (image blocks carry their URL). */
export async function GET(_request: Request, context: { params: Promise<{id:string}> }) {
  try {
    const {id}=await context.params;const user=await currentUser();
    const row=await db().prepare("SELECT id,owner_id,details,content,visibility FROM projects WHERE id=? AND deleted_at IS NULL AND ((hidden_at IS NULL AND visibility='public') OR owner_id=?)").bind(id,user?.id||'').first();
    if(!row)throw new ApiError(404,'작품을 찾을 수 없습니다.');
    await assertVisibleAuthor(String(row.owner_id),user?.id);
    let details={};try{details=JSON.parse(String(row.details||'{}'));}catch{}
    return json({id,details,content:resolveContent(row.content),draft:row.visibility==='draft'});
  } catch(error){return failure(error);}
}

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
  try{
    origin(request);const user=await requireUser();await limit(user.id,'edit-project',20);const {id}=await context.params;
    const existing=await db().prepare('SELECT * FROM projects WHERE id=? AND owner_id=?').bind(id,user.id).first();if(!existing)throw new ApiError(404,'수정할 작품을 찾을 수 없습니다.');
    const b=await body(request,PROJECT_BODY_LIMIT);
    if(existing.hidden_at)throw new ApiError(403,'운영자가 확인 중인 작품은 직접 다시 공개할 수 없습니다.');
    if(b.restore===true){await db().prepare('UPDATE projects SET deleted_at=NULL WHERE id=? AND owner_id=? AND hidden_at IS NULL').bind(id,user.id).run();return json({ok:true});}
    const parsed=parseProject({...b,creator:user.name});if(!parsed)throw new ApiError(400,projectProblem(b));
    if(parsed.url&&await isCuratedOrigin(parsed.url))throw new ApiError(409,'이미 소개 중인 서비스입니다.');
    // image omitted = keep the current cover, '' = remove it, data URL = replace it
    let image=String(existing.image||'');if(typeof b.image==='string'){if(b.image&&!parseCover(b.image))throw new ApiError(400,`커버 이미지는 ${COVER.width}×${COVER.height}px의 PNG·JPG·WebP, ${COVER.maxBytes/1024}KB 이하만 등록할 수 있어요.`);image=b.image;}
    // body omitted = keep; older clients send `gallery` (existing image ids and/or new data URLs)
    const rawBlocks=b.content!==undefined?b.content:Array.isArray(b.gallery)?b.gallery.map(item=>String(item).startsWith('data:')?{type:'image',data:item}:{type:'image',id:item}):undefined;
    let ops:D1PreparedStatement[]=[];let content=String(existing.content||'[]');
    if(rawBlocks!==undefined){
      const blocks=parseContent(rawBlocks);
      if(!blocks)throw new ApiError(400,`본문은 블록 ${CONTENT.maxBlocks}개, 이미지 ${CONTENT.maxImages}장(장당 ${GALLERY.maxBytes/1024}KB 이하), 글 ${CONTENT.maxTotalText.toLocaleString('ko-KR')}자까지 쓸 수 있어요.`);
      ({ops,json:content}=await contentStatements(id,blocks));
    }
    await db().prepare('UPDATE projects SET title=?,description=?,creator=?,type=?,url=?,image=?,genres=?,details=?,content=?,visibility=? WHERE id=? AND owner_id=? AND deleted_at IS NULL').bind(parsed.title,parsed.description,user.name,parsed.type,parsed.url||null,image,JSON.stringify(parsed.genres),JSON.stringify(parsed.details),content,b.draft===true?'draft':b.draft===false?'public':String(existing.visibility||'public'),id,user.id).run();
    if(ops.length)await db().batch(ops);
    return json({ok:true});
  }catch(error){if(error instanceof Error&&error.message.includes('UNIQUE'))return json({error:'이미 등록된 링크입니다.'},409);return failure(error);}
}
