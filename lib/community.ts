import { ApiError, db } from './api';
import { currentUser, type Member } from './auth';
import { assertVisibleAuthor } from './member-safety';

export async function entity(kind:string,id:string){
  if(!['project','post','comment'].includes(kind)||!id||id.length>100)throw new ApiError(400,'대상을 확인해주세요.');
  if(kind==='project'){
    const p=await db().prepare("SELECT id, owner_id, title, source, status FROM projects WHERE id = ? AND deleted_at IS NULL AND hidden_at IS NULL AND visibility = 'public'").bind(id).first();
    if(p){await assertVisibleAuthor(String(p.owner_id),(await currentUser())?.id);return{id,ownerId:p.source==='catalog'?null:String(p.owner_id),title:String(p.title),status:String(p.status||'live'),kind};}
  }
  if(kind==='post'){
    const p=await db().prepare('SELECT id, owner_id, title FROM posts WHERE id = ? AND deleted_at IS NULL AND hidden_at IS NULL').bind(id).first();
    if(p){await assertVisibleAuthor(String(p.owner_id),(await currentUser())?.id);return{id,ownerId:String(p.owner_id),title:String(p.title),status:'live',kind};}
  }
  if(kind==='comment'){
    const c=await db().prepare('SELECT id, owner_id, target_kind, target_id FROM comments WHERE id = ? AND deleted_at IS NULL AND hidden_at IS NULL').bind(id).first();
    if(c){await assertVisibleAuthor(String(c.owner_id),(await currentUser())?.id);await entity(String(c.target_kind),String(c.target_id));return{id,ownerId:String(c.owner_id),title:'댓글',status:'live',kind};}
  }
  throw new ApiError(404,'삭제되었거나 찾을 수 없는 콘텐츠입니다.');
}
export async function stats(kind:string,id:string,userId=''){
  const reactions=await db().prepare('SELECT COUNT(*) AS total, COALESCE(MAX(user_id = ?),0) AS mine FROM reactions WHERE target_kind = ? AND target_id = ?').bind(userId,kind,id).first();
  const comments=await db().prepare('SELECT COUNT(*) AS total FROM comments WHERE target_kind = ? AND target_id = ? AND deleted_at IS NULL AND hidden_at IS NULL').bind(kind,id).first();
  const result:{recommendations:number;recommended:boolean;comments:number;rating?:number;ratingCount?:number;myRating?:number;myReview?:string}={recommendations:Number(reactions?.total||0),recommended:!!reactions?.mine,comments:Number(comments?.total||0)};
  if(kind==='project'){
    const r=await db().prepare('SELECT AVG(score) AS average, COUNT(*) AS total, MAX(CASE WHEN user_id = ? THEN score ELSE 0 END) AS mine, MAX(CASE WHEN user_id = ? THEN review ELSE NULL END) AS my_review FROM ratings WHERE project_id = ?').bind(userId,userId,id).first();
    result.rating=Number(r?.average||0);result.ratingCount=Number(r?.total||0);result.myRating=Number(r?.mine||0);result.myReview=String(r?.my_review||'');
  }
  return result;
}
export async function notify(recipient:string|null,actor:Member,kind:string,targetKind:string,targetId:string,excerpt:string){
  if(!recipient){const admins=await db().prepare("SELECT id FROM profiles WHERE role='admin' AND suspended=0 LIMIT 10").all();for(const admin of admins.results)await notify(String(admin.id),actor,kind,targetKind,targetId,excerpt);return;}
  if(recipient===actor.id)return;
  if(await db().prepare('SELECT 1 FROM member_blocks WHERE owner_id=? AND target_id=?').bind(recipient,actor.id).first())return;
  await db().prepare('INSERT INTO notifications (id,recipient_id,actor_id,kind,target_kind,target_id,excerpt,created) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),recipient,actor.id,kind,targetKind,targetId,excerpt.slice(0,140),Date.now()).run();
}
export const postSelect=`SELECT p.id,p.title,p.body,p.category,p.project_id,p.created,p.updated,u.public_id AS author_id,u.name AS author_name,u.avatar AS author_avatar,(p.owner_id = ?) AS owned,(SELECT COUNT(*) FROM reactions r WHERE r.target_kind = 'post' AND r.target_id = p.id) AS recommendations,(SELECT COUNT(*) FROM comments c WHERE c.target_kind = 'post' AND c.target_id = p.id AND c.deleted_at IS NULL AND c.hidden_at IS NULL) AS comments,EXISTS(SELECT 1 FROM reactions r WHERE r.target_kind='post' AND r.target_id=p.id AND r.user_id=?) AS recommended FROM posts p JOIN profiles u ON u.id=p.owner_id`;
export function safePost(p:Record<string,unknown>){return {...p,owned:!!p.owned,recommended:!!p.recommended};}
