import { ApiError, body, db, failure, json, limit, origin, pageParams, text } from '../../../../lib/api';
import { currentUser, publicMember, requireAdmin, requireUser } from '../../../../lib/auth';
import { entity, notify, postSelect, safePost, stats } from '../../../../lib/community';

export const dynamic='force-dynamic';
type Context={params:Promise<{path?:string[]}>};
const categories=['general','showcase','buildlog','question','feedback'];

async function dispatch(request:Request,context:Context){
  const {path=[]}=await context.params;const [resource,id]=path;const method=request.method;const url=new URL(request.url);
  if(method!=='GET')origin(request);
  if(resource==='posts'){
    if(method==='GET'){
      const user=await currentUser();
      if(id){await entity('post',id);const item=await db().prepare(`${postSelect} WHERE p.id=? AND p.deleted_at IS NULL AND p.hidden_at IS NULL`).bind(user?.id||'',user?.id||'',id).first();if(!item)throw new ApiError(404,'게시글을 찾을 수 없습니다.');return json({post:safePost(item)});}
      const {offset,take}=pageParams(url);const q=(url.searchParams.get('q')||'').slice(0,100);const category=url.searchParams.get('category')||'all';const mine=url.searchParams.get('mine')==='1';if(mine&&!user)throw new ApiError(401,'로그인 후 이용해주세요.');
      const conditions=['p.deleted_at IS NULL','p.hidden_at IS NULL'];const bindings:unknown[]=[];
      if(q){conditions.push('(instr(lower(p.title),lower(?)) > 0 OR instr(lower(p.body),lower(?)) > 0)');bindings.push(q,q);}
      if(categories.includes(category)){conditions.push('p.category=?');bindings.push(category);}
      if(mine){conditions.push('p.owner_id=?');bindings.push(user!.id);}
      const where=conditions.join(' AND ');const order=url.searchParams.get('sort')==='popular'?'recommendations DESC,p.created DESC':'p.created DESC';
      const rows=await db().prepare(`${postSelect} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(user?.id||'',user?.id||'',...bindings,take,offset).all();
      const count=await db().prepare(`SELECT COUNT(*) AS total FROM posts p WHERE ${where}`).bind(...bindings).first();const total=Number(count?.total||0);
      return json({posts:rows.results.map(safePost),total,next:offset+take<total?offset+take:null});
    }
    const user=await requireUser();
    if(method==='POST'&&!id){await limit(user.id,'post',5,3600);const b=await body(request);const title=text(b.title,2,120,'제목');const content=text(b.body,2,12000,'본문');const category=typeof b.category==='string'&&categories.includes(b.category)?b.category:'general';let projectId:null|string=null;if(b.projectId){projectId=text(b.projectId,1,100,'연결 작품');await entity('project',projectId);}const postId=crypto.randomUUID();const now=Date.now();await db().prepare('INSERT INTO posts (id,owner_id,title,body,category,project_id,created,updated) VALUES(?,?,?,?,?,?,?,?)').bind(postId,user.id,title,content,category,projectId,now,now).run();return json({id:postId},201);}
    if(id&&(method==='PATCH'||method==='DELETE')){const p=await db().prepare('SELECT owner_id FROM posts WHERE id=? AND deleted_at IS NULL AND hidden_at IS NULL').bind(id).first();if(!p||p.owner_id!==user.id)throw new ApiError(404,'수정할 게시글을 찾을 수 없습니다.');if(method==='DELETE'){await db().prepare('UPDATE posts SET deleted_at=?,updated=? WHERE id=? AND owner_id=?').bind(Date.now(),Date.now(),id,user.id).run();return json({ok:true});}await limit(user.id,'edit',30);const b=await body(request);await db().prepare('UPDATE posts SET title=?,body=?,category=?,updated=? WHERE id=? AND owner_id=?').bind(text(b.title,2,120,'제목'),text(b.body,2,12000,'본문'),typeof b.category==='string'&&categories.includes(b.category)?b.category:'general',Date.now(),id,user.id).run();return json({ok:true});}
  }
  if(resource==='comments'){
    if(method==='GET'){
      const kind=url.searchParams.get('kind')||'';const targetId=url.searchParams.get('id')||'';if(!['project','post'].includes(kind))throw new ApiError(400,'댓글 대상을 확인해주세요.');await entity(kind,targetId);const user=await currentUser();const {offset}=pageParams(url);const take=50;
      const rows=await db().prepare(`SELECT c.id,c.parent_id,CASE WHEN c.deleted_at IS NOT NULL THEN '삭제된 댓글입니다.' WHEN c.hidden_at IS NOT NULL THEN '운영자가 숨긴 댓글입니다.' ELSE c.body END AS body,c.created,c.updated,(c.deleted_at IS NOT NULL OR c.hidden_at IS NOT NULL) AS removed,u.public_id AS author_id,u.name AS author_name,u.avatar AS author_avatar,(c.owner_id=?) AS owned,(SELECT COUNT(*) FROM reactions r WHERE r.target_kind='comment' AND r.target_id=c.id) AS recommendations,EXISTS(SELECT 1 FROM reactions r WHERE r.target_kind='comment' AND r.target_id=c.id AND r.user_id=?) AS recommended FROM comments c JOIN profiles u ON u.id=c.owner_id WHERE c.target_kind=? AND c.target_id=? ORDER BY c.created ASC,c.id ASC LIMIT ? OFFSET ?`).bind(user?.id||'',user?.id||'',kind,targetId,take+1,offset).all();
      return json({comments:rows.results.slice(0,take).map(c=>({...c,owned:!!c.owned,removed:!!c.removed,recommended:!!c.recommended})),next:rows.results.length>take?offset+take:null});
    }
    const user=await requireUser();
    if(method==='POST'&&!id){await limit(user.id,'comment',8);const b=await body(request);const kind=String(b.kind);if(!['project','post'].includes(kind))throw new ApiError(400,'댓글 대상을 확인해주세요.');const targetId=text(b.targetId,1,100,'대상');const target=await entity(kind,targetId);const content=text(b.body,1,2000,'댓글');let parentId:null|string=null;let recipient=target.ownerId;
      if(b.parentId){parentId=text(b.parentId,1,100,'답글 대상');const parent=await db().prepare('SELECT owner_id,target_kind,target_id,parent_id FROM comments WHERE id=? AND deleted_at IS NULL AND hidden_at IS NULL').bind(parentId).first();if(!parent||parent.target_kind!==kind||parent.target_id!==targetId||parent.parent_id)throw new ApiError(400,'답글을 달 수 없는 댓글입니다.');recipient=String(parent.owner_id);}
      const commentId=crypto.randomUUID();const now=Date.now();await db().prepare('INSERT INTO comments (id,owner_id,target_kind,target_id,parent_id,body,created,updated) VALUES(?,?,?,?,?,?,?,?)').bind(commentId,user.id,kind,targetId,parentId,content,now,now).run();await notify(recipient,user,parentId?'reply':'comment',kind,targetId,content);return json({id:commentId},201);
    }
    if(id&&(method==='PATCH'||method==='DELETE')){const c=await db().prepare('SELECT owner_id,target_kind,target_id FROM comments WHERE id=? AND deleted_at IS NULL AND hidden_at IS NULL').bind(id).first();if(!c||c.owner_id!==user.id)throw new ApiError(404,'수정할 댓글을 찾을 수 없습니다.');await entity(String(c.target_kind),String(c.target_id));if(method==='DELETE')await db().prepare('UPDATE comments SET deleted_at=?,updated=? WHERE id=? AND owner_id=?').bind(Date.now(),Date.now(),id,user.id).run();else{await limit(user.id,'edit',30);const b=await body(request);await db().prepare('UPDATE comments SET body=?,updated=? WHERE id=? AND owner_id=?').bind(text(b.body,1,2000,'댓글'),Date.now(),id,user.id).run();}return json({ok:true});}
  }
  if(resource==='react'&&method==='PUT'){
    const user=await requireUser();await limit(user.id,'react',40);const b=await body(request);const kind=String(b.kind);const targetId=text(b.targetId,1,100,'대상');await entity(kind,targetId);if(typeof b.active!=='boolean')throw new ApiError(400,'추천 상태를 확인해주세요.');
    if(b.active)await db().prepare('INSERT INTO reactions (user_id,target_kind,target_id,created) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').bind(user.id,kind,targetId,Date.now()).run();else await db().prepare('DELETE FROM reactions WHERE user_id=? AND target_kind=? AND target_id=?').bind(user.id,kind,targetId).run();return json(await stats(kind,targetId,user.id));
  }
  if(resource==='ratings'&&id){
    const target=await entity('project',id);
    if(method==='GET'){
      const user=await currentUser();const {offset,take}=pageParams(url);const rows=await db().prepare('SELECT r.score,r.review,r.created,r.updated,u.name AS author_name,u.public_id AS author_id,(r.user_id=?) AS owned FROM ratings r JOIN profiles u ON u.id=r.user_id WHERE r.project_id=? ORDER BY r.updated DESC LIMIT ? OFFSET ?').bind(user?.id||'',id,take+1,offset).all();return json({stats:await stats('project',id,user?.id),reviews:rows.results.slice(0,take).map(r=>({...r,owned:!!r.owned})),next:rows.results.length>take?offset+take:null});
    }
    const user=await requireUser();if(target.status==='upcoming'||target.status==='sample')throw new ApiError(409,'공개된 작품만 평가할 수 있습니다.');
    if(method==='PUT'){await limit(user.id,'rating',20);const b=await body(request);if(!Number.isInteger(b.score)||Number(b.score)<1||Number(b.score)>5)throw new ApiError(400,'별점은 1~5점 중에서 선택해주세요.');const review=b.review===undefined?'':text(b.review,0,1000,'한 줄 리뷰');const now=Date.now();await db().prepare('INSERT INTO ratings (user_id,project_id,score,review,created,updated) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,project_id) DO UPDATE SET score=excluded.score,review=excluded.review,updated=excluded.updated').bind(user.id,id,b.score,review,now,now).run();return json(await stats('project',id,user.id));}
    if(method==='DELETE'){await db().prepare('DELETE FROM ratings WHERE user_id=? AND project_id=?').bind(user.id,id).run();return json(await stats('project',id,user.id));}
  }
  if(resource==='bookmarks'){
    const user=await requireUser();if(method==='GET'){const rows=await db().prepare('SELECT project_id FROM bookmarks WHERE user_id=? ORDER BY created DESC').bind(user.id).all();return json({ids:rows.results.map(r=>r.project_id)});}
    if(method==='PUT'){await limit(user.id,'bookmark',40);const b=await body(request);const projectId=text(b.projectId,1,100,'작품');await entity('project',projectId);if(typeof b.active!=='boolean')throw new ApiError(400,'찜 상태를 확인해주세요.');if(b.active)await db().prepare('INSERT INTO bookmarks (user_id,project_id,created) VALUES(?,?,?) ON CONFLICT DO NOTHING').bind(user.id,projectId,Date.now()).run();else await db().prepare('DELETE FROM bookmarks WHERE user_id=? AND project_id=?').bind(user.id,projectId).run();return json({ok:true});}
  }
  if(resource==='profile'){
    const user=await requireUser();if(method==='GET'){
      const ownProjects=await db().prepare('SELECT id,title,created,deleted_at,hidden_at FROM projects WHERE owner_id=? ORDER BY created DESC LIMIT 100').bind(user.id).all();
      const ownPosts=await db().prepare('SELECT id,title,created,deleted_at FROM posts WHERE owner_id=? ORDER BY created DESC LIMIT 100').bind(user.id).all();
      const ownComments=await db().prepare('SELECT id,target_kind,target_id,body,created FROM comments WHERE owner_id=? AND deleted_at IS NULL AND hidden_at IS NULL ORDER BY created DESC LIMIT 50').bind(user.id).all();
      return json({user:publicMember(user),projects:ownProjects.results,posts:ownPosts.results,comments:ownComments.results});
    }
    if(method==='PATCH'){await limit(user.id,'profile',10,3600);const b=await body(request);await db().prepare('UPDATE profiles SET name=?,bio=?,updated=? WHERE id=?').bind(text(b.name,2,30,'닉네임'),text(b.bio||'',0,200,'소개'),Date.now(),user.id).run();return json({ok:true});}
  }
  if(resource==='notifications'){
    const user=await requireUser();if(method==='GET'){const rows=await db().prepare('SELECT n.id,n.kind,n.target_kind,n.target_id,n.excerpt,n.created,n.read_at,u.name AS actor_name FROM notifications n JOIN profiles u ON u.id=n.actor_id WHERE n.recipient_id=? ORDER BY n.created DESC LIMIT 50').bind(user.id).all();const count=await db().prepare('SELECT COUNT(*) AS total FROM notifications WHERE recipient_id=? AND read_at IS NULL').bind(user.id).first();return json({notifications:rows.results,unread:Number(count?.total||0)});}
    if(method==='PATCH'){const b=await body(request);if(b.id)await db().prepare('UPDATE notifications SET read_at=? WHERE id=? AND recipient_id=?').bind(Date.now(),String(b.id),user.id).run();else await db().prepare('UPDATE notifications SET read_at=? WHERE recipient_id=? AND read_at IS NULL').bind(Date.now(),user.id).run();return json({ok:true});}
  }
  if(resource==='reports'&&method==='POST'){
    const user=await requireUser();await limit(user.id,'report',5,3600);const b=await body(request);const kind=String(b.kind);const targetId=text(b.targetId,1,100,'대상');await entity(kind,targetId);const reason=text(b.reason,5,500,'신고 사유');const existing=await db().prepare("SELECT id FROM reports WHERE reporter_id=? AND target_kind=? AND target_id=? AND status='pending'").bind(user.id,kind,targetId).first();if(existing)throw new ApiError(409,'이미 접수된 신고입니다.');await db().prepare('INSERT INTO reports (id,reporter_id,target_kind,target_id,reason,created) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),user.id,kind,targetId,reason,Date.now()).run();return json({ok:true},201);
  }
  if(resource==='moderation'){
    await requireAdmin();if(method==='GET'){const rows=await db().prepare(`SELECT r.id,r.target_kind,r.target_id,r.reason,r.status,r.created,u.name AS reporter_name,CASE WHEN r.target_kind='comment' THEN (SELECT body FROM comments WHERE id=r.target_id) WHEN r.target_kind='post' THEN (SELECT title || char(10) || body FROM posts WHERE id=r.target_id) ELSE (SELECT title || char(10) || description FROM projects WHERE id=r.target_id) END AS content,CASE WHEN r.target_kind='comment' THEN (SELECT target_kind FROM comments WHERE id=r.target_id) ELSE r.target_kind END AS content_kind,CASE WHEN r.target_kind='comment' THEN (SELECT target_id FROM comments WHERE id=r.target_id) ELSE r.target_id END AS content_id FROM reports r JOIN profiles u ON u.id=r.reporter_id ORDER BY (r.status='pending') DESC,r.created DESC LIMIT 100`).all();return json({reports:rows.results});}
    if(method==='PATCH'){const b=await body(request);const reportId=text(b.id,1,100,'신고');const report=await db().prepare("SELECT * FROM reports WHERE id=? AND status='pending'").bind(reportId).first();if(!report)throw new ApiError(404,'처리할 신고를 찾을 수 없습니다.');if(!['dismiss','hide'].includes(String(b.action)))throw new ApiError(400,'처리 방식을 확인해주세요.');
      if(b.action==='hide'){const table=report.target_kind==='post'?'posts':report.target_kind==='comment'?'comments':report.target_kind==='project'?'projects':'';if(!table)throw new ApiError(400,'처리할 수 없는 대상입니다.');if(table==='projects'&&!String(report.target_id).startsWith('community-'))throw new ApiError(409,'기본 작품은 운영 소스에서 수정해주세요.');await db().prepare(`UPDATE ${table} SET hidden_at=? WHERE id=?`).bind(Date.now(),report.target_id).run();}
      await db().prepare('UPDATE reports SET status=?,resolved_at=? WHERE id=?').bind(b.action==='hide'?'resolved':'dismissed',Date.now(),reportId).run();return json({ok:true});}
  }
  throw new ApiError(404,'지원하지 않는 요청입니다.');
}
async function handle(request:Request,context:Context){try{return await dispatch(request,context);}catch(error){return failure(error);}}
export const GET=handle;export const POST=handle;export const PUT=handle;export const PATCH=handle;export const DELETE=handle;
