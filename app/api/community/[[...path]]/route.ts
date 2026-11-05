import { waitUntil } from 'cloudflare:workers';
import { ApiError, body, db, failure, json, limit, origin, pageParams, text } from '../../../../lib/api';
import { currentUser, digest, publicMember, requireAdmin, requireUser } from '../../../../lib/auth';
import { NEW_ACCOUNT, accountAge, entity, notify, postSelect, safePost, stats, systemNotify } from '../../../../lib/community';
import { normalizeUrl, publicUrl } from '../../../../lib/project-input';
import { kstDay } from '../../../../lib/admin';
import { alertNewReport, createAppeal, reportCategory, reportReason, resolveReports } from '../../../../lib/moderation';

import { blockedPublicIds, requireContentConsent } from '../../../../lib/member-safety';

export const dynamic='force-dynamic';
type Context={params:Promise<{path?:string[]}>};
const categories=['general','showcase','buildlog','question','feedback'];

async function dispatch(request:Request,context:Context){
  const {path=[]}=await context.params;const [resource,id,sub]=path;const method=request.method;const url=new URL(request.url);
  if(method!=='GET')origin(request);
  if((method==='POST'&&['posts','comments'].includes(resource))||(method==='PUT'&&resource==='ratings'))await requireContentConsent((await requireUser()).id);
  if(resource==='posts'){
    if(method==='GET'){
      const user=await currentUser();
      if(id){await entity('post',id);const item=await db().prepare(`${postSelect} WHERE p.id=? AND p.deleted_at IS NULL AND p.hidden_at IS NULL`).bind(user?.id||'',user?.id||'',id).first();if(!item)throw new ApiError(404,'게시글을 찾을 수 없습니다.');return json({post:safePost(item)});}
      const blocked=await blockedPublicIds(user?.id);const {offset,take}=pageParams(url);const q=(url.searchParams.get('q')||'').slice(0,100);const category=url.searchParams.get('category')||'all';const mine=url.searchParams.get('mine')==='1';if(mine&&!user)throw new ApiError(401,'로그인 후 이용해주세요.');
      const conditions=['p.deleted_at IS NULL','p.hidden_at IS NULL'];const bindings:unknown[]=[];
      if(q){conditions.push('(instr(lower(p.title),lower(?)) > 0 OR instr(lower(p.body),lower(?)) > 0)');bindings.push(q,q);}
      if(categories.includes(category)){conditions.push('p.category=?');bindings.push(category);}
      if(mine){conditions.push('p.owner_id=?');bindings.push(user!.id);}
      if(url.searchParams.get('unsolved')==='1')conditions.push("p.category='question' AND p.solved_comment IS NULL");
      const sortBy=url.searchParams.get('sort');
      // 'active': posts with the most recent conversation first (storytellers want their threads to surface)
      const where=conditions.join(' AND ');const order=sortBy==='popular'?'recommendations DESC,p.created DESC':sortBy==='active'?"COALESCE((SELECT MAX(c.created) FROM comments c WHERE c.target_kind='post' AND c.target_id=p.id AND c.deleted_at IS NULL AND c.hidden_at IS NULL),p.created) DESC":'p.created DESC';
      const rows=await db().prepare(`${postSelect} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(user?.id||'',user?.id||'',...bindings,take,offset).all();
      const count=await db().prepare(`SELECT COUNT(*) AS total FROM posts p WHERE ${where}`).bind(...bindings).first();const total=Number(count?.total||0);
      return json({posts:rows.results.filter(p=>!blocked.has(String(p.author_id))).map(safePost),total,next:offset+take<total?offset+take:null});
    }
    const user=await requireUser();
    // Question posts: the asker marks the reply that solved it (or clears it); the person who answered is told
    if(id&&sub==='solve'&&method==='PUT'){
      const post=await db().prepare('SELECT owner_id,category,title,solved_comment FROM posts WHERE id=? AND deleted_at IS NULL AND hidden_at IS NULL').bind(id).first();
      if(!post||post.owner_id!==user.id)throw new ApiError(404,'질문을 찾을 수 없어요.');if(post.category!=='question')throw new ApiError(400,'질문 글에서만 답변을 채택할 수 있어요.');
      const b=await body(request);const commentId=typeof b.commentId==='string'&&b.commentId?b.commentId:null;
      if(commentId){const c=await db().prepare("SELECT owner_id FROM comments WHERE id=? AND target_kind='post' AND target_id=? AND deleted_at IS NULL AND hidden_at IS NULL").bind(commentId,id).first();if(!c)throw new ApiError(400,'채택할 답변을 찾을 수 없어요.');if(c.owner_id===user.id)throw new ApiError(400,'내가 쓴 댓글은 채택할 수 없어요.');
        await db().prepare('UPDATE posts SET solved_comment=? WHERE id=?').bind(commentId,id).run();if(post.solved_comment!==commentId)await notify(String(c.owner_id),user,'accepted','post',id,`${post.title} · 내 답변이 채택됐어요`);}
      else await db().prepare('UPDATE posts SET solved_comment=NULL WHERE id=?').bind(id).run();
      return json({ok:true,solvedComment:commentId});
    }
    if(method==='POST'&&!id){await limit(user.id,'post',5,3600);const b=await body(request);const title=text(b.title,2,120,'제목');const content=text(b.body,2,12000,'본문');const category=typeof b.category==='string'&&categories.includes(b.category)?b.category:'general';let projectId:null|string=null;if(b.projectId){projectId=text(b.projectId,1,100,'연결 작품');await entity('project',projectId);}const postId=crypto.randomUUID();const now=Date.now();await db().prepare('INSERT INTO posts (id,owner_id,title,body,category,project_id,created,updated) VALUES(?,?,?,?,?,?,?,?)').bind(postId,user.id,title,content,category,projectId,now,now).run();return json({id:postId},201);}
    if(id&&(method==='PATCH'||method==='DELETE')){const p=await db().prepare('SELECT owner_id,project_id FROM posts WHERE id=? AND deleted_at IS NULL AND hidden_at IS NULL').bind(id).first();if(!p||p.owner_id!==user.id)throw new ApiError(404,'수정할 게시글을 찾을 수 없습니다.');if(method==='DELETE'){await db().prepare('UPDATE posts SET deleted_at=?,updated=? WHERE id=? AND owner_id=?').bind(Date.now(),Date.now(),id,user.id).run();return json({ok:true});}await limit(user.id,'edit',30);const b=await body(request);
      // a linked work is only checked when it changes (the one already linked may since have been taken down)
      let projectId=p.project_id?String(p.project_id):null;if('projectId' in b){const next=b.projectId?text(b.projectId,1,100,'연결 작품'):null;if(next&&next!==projectId)await entity('project',next);projectId=next;}
      await db().prepare('UPDATE posts SET title=?,body=?,category=?,project_id=?,updated=? WHERE id=? AND owner_id=?').bind(text(b.title,2,120,'제목'),text(b.body,2,12000,'본문'),typeof b.category==='string'&&categories.includes(b.category)?b.category:'general',projectId,Date.now(),id,user.id).run();return json({ok:true});}
  }
  if(resource==='comments'){
    if(method==='GET'){
      const kind=url.searchParams.get('kind')||'';const targetId=url.searchParams.get('id')||'';if(!['project','post','entry'].includes(kind))throw new ApiError(400,'댓글 대상을 확인해주세요.');await entity(kind,targetId);const user=await currentUser();const {offset}=pageParams(url);const take=50;
      const rows=await db().prepare(`SELECT c.id,c.parent_id,c.label,c.status,c.status_entry,(SELECT CASE WHEN e.version<>'' THEN 'v'||ltrim(e.version,'vV')||' · '||e.title ELSE e.title END FROM entries e WHERE e.id=c.status_entry AND e.status='published' AND e.published_at<=?) AS status_entry_label,CASE WHEN c.deleted_at IS NOT NULL THEN '삭제된 댓글입니다.' WHEN c.hidden_at IS NOT NULL THEN '운영자가 숨긴 댓글입니다.' ELSE c.body END AS body,c.created,c.updated,(c.deleted_at IS NOT NULL OR c.hidden_at IS NOT NULL) AS removed,u.public_id AS author_id,u.name AS author_name,u.avatar AS author_avatar,(c.owner_id=?) AS owned,(SELECT COUNT(*) FROM reactions r WHERE r.target_kind='comment' AND r.target_id=c.id) AS recommendations,EXISTS(SELECT 1 FROM reactions r WHERE r.target_kind='comment' AND r.target_id=c.id AND r.user_id=?) AS recommended FROM comments c JOIN profiles u ON u.id=c.owner_id WHERE c.target_kind=? AND c.target_id=? ORDER BY c.created ASC,c.id ASC LIMIT ? OFFSET ?`).bind(Date.now(),user?.id||'',user?.id||'',kind,targetId,take+1,offset).all();
      const blocked=await blockedPublicIds(user?.id);return json({comments:rows.results.slice(0,take).filter(c=>!blocked.has(String(c.author_id))).map(c=>({...c,owned:!!c.owned,removed:!!c.removed,recommended:!!c.recommended})),next:rows.results.length>take?offset+take:null});
    }
    const user=await requireUser();
    if(method==='POST'&&!id){await limit(user.id,'comment',8);const b=await body(request);const kind=String(b.kind);if(!['project','post','entry'].includes(kind))throw new ApiError(400,'댓글 대상을 확인해주세요.');const targetId=text(b.targetId,1,100,'대상');const target=await entity(kind,targetId);const content=text(b.body,1,2000,'댓글');let parentId:null|string=null;let recipient=target.ownerId;
      // spam guards: the same text twice within 10 minutes, and links from accounts younger than a day
      // short replies like "감사합니다!" may repeat across posts; long or linked copy-paste may not
      const hasLink=/https?:\/\/|www\./i.test(content);
      if(await db().prepare(`SELECT 1 FROM comments WHERE owner_id=? AND body=? AND created>? AND deleted_at IS NULL ${content.length>=20||hasLink?'':'AND target_kind=? AND target_id=?'}`).bind(user.id,content,Date.now()-600000,...(content.length>=20||hasLink?[]:[kind,targetId])).first())throw new ApiError(429,'같은 내용의 댓글을 방금 남겼어요. 도배로 보일 수 있어 한 번만 올렸어요.');
      if(hasLink&&await accountAge(user.id)<NEW_ACCOUNT)await limit(user.id,'new-link-comment',3,3600);
      if(b.parentId){parentId=text(b.parentId,1,100,'답글 대상');const parent=await db().prepare('SELECT owner_id,target_kind,target_id,parent_id FROM comments WHERE id=? AND deleted_at IS NULL AND hidden_at IS NULL').bind(parentId).first();if(!parent||parent.target_kind!==kind||parent.target_id!==targetId||parent.parent_id)throw new ApiError(400,'답글을 달 수 없는 댓글입니다.');recipient=String(parent.owner_id);}
      // top-level comments on a work can be tagged as feedback or a bug report
      const label=!parentId&&kind==='project'&&['feedback','bug'].includes(String(b.label))?String(b.label):'';
      const commentId=crypto.randomUUID();const now=Date.now();await db().prepare('INSERT INTO comments (id,owner_id,target_kind,target_id,parent_id,body,label,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').bind(commentId,user.id,kind,targetId,parentId,content,label,now,now).run();await notify(recipient,user,parentId?'reply':'comment',kind,kind==='entry'?`${target.projectId}/${targetId}`:targetId,content);return json({id:commentId},201);
    }
    if(id&&(method==='PATCH'||method==='DELETE')){const c=await db().prepare('SELECT owner_id,target_kind,target_id FROM comments WHERE id=? AND deleted_at IS NULL AND hidden_at IS NULL').bind(id).first();if(!c||c.owner_id!==user.id)throw new ApiError(404,'수정할 댓글을 찾을 수 없습니다.');await entity(String(c.target_kind),String(c.target_id));if(method==='DELETE')await db().prepare('UPDATE comments SET deleted_at=?,updated=? WHERE id=? AND owner_id=?').bind(Date.now(),Date.now(),id,user.id).run();else{await limit(user.id,'edit',30);const b=await body(request);await db().prepare('UPDATE comments SET body=?,updated=? WHERE id=? AND owner_id=?').bind(text(b.body,1,2000,'댓글'),Date.now(),id,user.id).run();}return json({ok:true});}
  }
  // The work's creator marks a feedback / bug-report comment as seen ('ack') or fixed (optionally in an update note);
  // the commenter is told once per change.
  if(resource==='triage'&&id&&method==='PUT'){
    const user=await requireUser();await limit(user.id,'triage',60);const b=await body(request);
    const status=['','ack','fixed'].includes(String(b.status??''))?String(b.status??''):null;if(status===null)throw new ApiError(400,'상태를 확인해주세요.');
    const c=await db().prepare("SELECT c.id,c.owner_id,c.label,c.status,c.parent_id,c.target_id,p.owner_id AS work_owner,p.title AS work_title FROM comments c JOIN projects p ON p.id=c.target_id WHERE c.id=? AND c.target_kind='project' AND c.deleted_at IS NULL AND c.hidden_at IS NULL").bind(id).first();
    if(!c||c.work_owner!==user.id)throw new ApiError(404,'상태를 바꿀 댓글을 찾을 수 없어요.');
    if(c.parent_id||!['feedback','bug'].includes(String(c.label)))throw new ApiError(400,'피드백·버그 제보 댓글만 상태를 정할 수 있어요.');
    let entry:null|string=null;let entryLabel='';
    if(status==='fixed'&&typeof b.entryId==='string'&&b.entryId){const e=await db().prepare("SELECT id,version,title FROM entries WHERE id=? AND project_id=? AND kind='update' AND status='published'").bind(b.entryId,c.target_id).first();if(!e)throw new ApiError(400,'연결할 업데이트 소식을 찾을 수 없어요.');entry=String(e.id);entryLabel=e.version?`v${String(e.version).replace(/^v/i,'')}`:String(e.title);}
    await db().prepare('UPDATE comments SET status=?,status_entry=? WHERE id=?').bind(status,entry,id).run();
    if(status&&status!==c.status&&c.owner_id!==user.id){const what=c.label==='bug'?'버그 제보':'피드백';await systemNotify(String(c.owner_id),user.id,'triage','work',String(c.target_id),`${c.work_title} · ${status==='fixed'?`남긴 ${what}가 반영됐어요${entryLabel?` (${entryLabel})`:''}`:`작가가 남긴 ${what}를 확인했어요`}`);}
    return json({ok:true,status,statusEntry:entry});
  }
  if(resource==='react'&&method==='PUT'){
    const user=await requireUser();await limit(user.id,'react',40);const b=await body(request);const kind=String(b.kind);const targetId=text(b.targetId,1,100,'대상');const reacted=await entity(kind,targetId);if(typeof b.active!=='boolean')throw new ApiError(400,'추천 상태를 확인해주세요.');
    if(b.active&&reacted.ownerId===user.id)throw new ApiError(400,'내가 올린 콘텐츠는 추천할 수 없어요.');
    if(b.active)await db().prepare('INSERT INTO reactions (user_id,target_kind,target_id,created) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').bind(user.id,kind,targetId,Date.now()).run();else await db().prepare('DELETE FROM reactions WHERE user_id=? AND target_kind=? AND target_id=?').bind(user.id,kind,targetId).run();return json(await stats(kind,targetId,user.id));
  }
  if(resource==='ratings'&&id){
    const target=await entity('project',id);
    if(method==='GET'){
      const user=await currentUser();const {offset,take}=pageParams(url);const rows=await db().prepare('SELECT r.score,r.review,r.created,r.updated,u.name AS author_name,u.public_id AS author_id,(r.user_id=?) AS owned FROM ratings r JOIN profiles u ON u.id=r.user_id WHERE r.project_id=? ORDER BY r.updated DESC LIMIT ? OFFSET ?').bind(user?.id||'',id,take+1,offset).all();const blocked=await blockedPublicIds(user?.id);const dist=await db().prepare('SELECT score,COUNT(*) n FROM ratings WHERE project_id=? GROUP BY score').bind(id).all();const distribution=[1,2,3,4,5].map(n=>Number(dist.results.find(r=>Number(r.score)===n)?.n||0));return json({stats:await stats('project',id,user?.id),distribution,reviews:rows.results.slice(0,take).filter(r=>!blocked.has(String(r.author_id))).map(r=>({...r,owned:!!r.owned})),next:rows.results.length>take?offset+take:null});
    }
    const user=await requireUser();if(target.status==='upcoming'||target.status==='sample')throw new ApiError(409,'공개된 작품만 평가할 수 있습니다.');
    if(method==='PUT'&&target.ownerId===user.id)throw new ApiError(400,'내 작품에는 별점을 남길 수 없어요.');
    if(method==='PUT'){await limit(user.id,'rating',20);const b=await body(request);if(!Number.isInteger(b.score)||Number(b.score)<1||Number(b.score)>5)throw new ApiError(400,'별점은 1~5점 중에서 선택해주세요.');const review=b.review===undefined?'':text(b.review,0,1000,'한 줄 리뷰');const now=Date.now();await db().prepare('INSERT INTO ratings (user_id,project_id,score,review,created,updated) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,project_id) DO UPDATE SET score=excluded.score,review=excluded.review,updated=excluded.updated').bind(user.id,id,b.score,review,now,now).run();return json(await stats('project',id,user.id));}
    if(method==='DELETE'){await db().prepare('DELETE FROM ratings WHERE user_id=? AND project_id=?').bind(user.id,id).run();return json(await stats('project',id,user.id));}
  }
  if(resource==='bookmarks'){
    const user=await requireUser();if(method==='GET'){const rows=await db().prepare('SELECT project_id FROM bookmarks WHERE user_id=? ORDER BY created DESC').bind(user.id).all();return json({ids:rows.results.map(r=>r.project_id)});}
    if(method==='PUT'){await limit(user.id,'bookmark',40);const b=await body(request);const projectId=text(b.projectId,1,100,'작품');await entity('project',projectId);if(typeof b.active!=='boolean')throw new ApiError(400,'찜 상태를 확인해주세요.');if(b.active)await db().prepare('INSERT INTO bookmarks (user_id,project_id,created) VALUES(?,?,?) ON CONFLICT DO NOTHING').bind(user.id,projectId,Date.now()).run();else await db().prepare('DELETE FROM bookmarks WHERE user_id=? AND project_id=?').bind(user.id,projectId).run();return json({ok:true});}
  }
  if(resource==='profile'){
    const user=await requireUser();if(method==='GET'){
      const ownProjects=await db().prepare('SELECT id,title,created,deleted_at,hidden_at,visibility FROM projects WHERE owner_id=? ORDER BY created DESC LIMIT 100').bind(user.id).all();
      const ownPosts=await db().prepare('SELECT id,title,created,deleted_at,hidden_at FROM posts WHERE owner_id=? ORDER BY created DESC LIMIT 100').bind(user.id).all();
      const ownComments=await db().prepare('SELECT id,target_kind,target_id,body,created FROM comments WHERE owner_id=? AND deleted_at IS NULL AND hidden_at IS NULL ORDER BY created DESC LIMIT 50').bind(user.id).all();
      const links=await db().prepare('SELECT links FROM profiles WHERE id=?').bind(user.id).first();let parsed:string[]=[];try{parsed=JSON.parse(String(links?.links||'[]'));}catch{}
      return json({user:{...publicMember(user),links:parsed},projects:ownProjects.results,posts:ownPosts.results,comments:ownComments.results});
    }
    if(method==='PATCH'){await limit(user.id,'profile',10,3600);const b=await body(request);
      // portfolio, GitHub, shop… up to three public links on the creator page (older clients don't send them)
      const raw=Array.isArray(b.links)?b.links:typeof b.links==='string'?b.links.split('\n'):null;
      const links=raw?raw.map(v=>String(v).trim()).filter(Boolean).slice(0,3).map(v=>{const u=publicUrl(normalizeUrl(v));if(!u)throw new ApiError(400,`링크를 확인해주세요: ${v.slice(0,40)}`);return u;}):null;
      await db().prepare(`UPDATE profiles SET name=?,bio=?,${links?'links=?,':''}updated=? WHERE id=?`).bind(text(b.name,2,30,'닉네임'),text(b.bio||'',0,200,'소개'),...(links?[JSON.stringify(links)]:[]),Date.now(),user.id).run();return json({ok:true});}
  }
  if(resource==='notifications'){
    // read notifications older than 90 days are trimmed now and then (they otherwise grow forever)
    if(method==='GET'&&Math.random()<.02)waitUntil(db().prepare('DELETE FROM notifications WHERE read_at IS NOT NULL AND created<?').bind(Date.now()-90*86400000).run().catch(()=>{}));
    const user=await requireUser();if(method==='GET'){const rows=await db().prepare('SELECT n.id,n.kind,n.target_kind,n.target_id,n.excerpt,n.created,n.read_at,u.name AS actor_name FROM notifications n JOIN profiles u ON u.id=n.actor_id WHERE n.recipient_id=? ORDER BY n.created DESC LIMIT 50').bind(user.id).all();const count=await db().prepare('SELECT COUNT(*) AS total FROM notifications WHERE recipient_id=? AND read_at IS NULL').bind(user.id).first();return json({notifications:rows.results,unread:Number(count?.total||0)});}
    if(method==='PATCH'){const b=await body(request);if(b.id)await db().prepare('UPDATE notifications SET read_at=? WHERE id=? AND recipient_id=?').bind(Date.now(),String(b.id),user.id).run();else await db().prepare('UPDATE notifications SET read_at=? WHERE recipient_id=? AND read_at IS NULL').bind(Date.now(),user.id).run();return json({ok:true});}
  }
  if(resource==='reports'&&method==='POST'){
    const user=await requireUser();await limit(user.id,'report',5,3600);const b=await body(request);const kind=String(b.kind);const targetId=text(b.targetId,1,100,'대상');await entity(kind,targetId);const category=reportCategory(b.category);const reason=reportReason(b.reason,category);const existing=await db().prepare("SELECT id FROM reports WHERE reporter_id=? AND target_kind=? AND target_id=? AND status='pending'").bind(user.id,kind,targetId).first();if(existing)throw new ApiError(409,'이미 접수된 신고입니다.');await db().prepare('INSERT INTO reports (id,reporter_id,target_kind,target_id,reason,category,created) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),user.id,kind,targetId,reason,category,Date.now()).run();await alertNewReport(user.id,kind,targetId,category);return json({ok:true},201);
  }
  // What the creators I follow published in the last 30 days: new episodes/updates and new works
  if(resource==='feed'&&method==='GET'){
    const user=await requireUser();const since=Date.now()-30*86400000;const now=Date.now();
    const cover="CASE WHEN p.image LIKE 'data:%' THEN '/api/projects/' || p.id || '/cover?v=' || length(p.image) ELSE p.image END";
    const live="p.visibility='public' AND p.hidden_at IS NULL AND p.deleted_at IS NULL AND p.owner_id IN (SELECT creator_id FROM follows WHERE follower_id=?)";
    const rows=await db().prepare(`SELECT * FROM (SELECT e.id AS entry_id,e.kind,e.number,e.version,e.title,e.published_at AS at,p.id AS project_id,p.title AS work_title,p.type,${cover} AS image,u.name AS creator FROM entries e JOIN projects p ON p.id=e.project_id JOIN profiles u ON u.id=p.owner_id WHERE ${live} AND e.status='published' AND e.published_at<=? AND e.published_at>? UNION ALL SELECT NULL,'work',NULL,'',p.title,p.created,p.id,p.title,p.type,${cover},u.name FROM projects p JOIN profiles u ON u.id=p.owner_id WHERE ${live} AND p.created>?) ORDER BY at DESC LIMIT 20`).bind(user.id,now,since,user.id,since).all();
    return json({items:rows.results});
  }
  if(resource==='appeals'&&method==='POST'){
    const user=await requireUser();await limit(user.id,'appeal',5,3600);const b=await body(request);
    const appeal=await createAppeal(user.id,String(b.kind),text(b.targetId,1,100,'대상'),text(b.reason,10,1000,'이의 제기 사유'));return json({id:appeal},201);
  }
  // Searches that found nothing, counted per day without any account or IP attached (what visitors look for but can't find)
  if(resource==='search-miss'&&method==='POST'){
    const ip=request.headers.get('cf-connecting-ip')||'local';await limit(`ip:${(await digest(ip)).slice(0,24)}`,'search-miss',20);
    const b=await body(request,2000);const q=typeof b.q==='string'?b.q.normalize('NFC').trim().toLowerCase().replace(/\s+/g,' ').slice(0,50):'';
    if(q.length<2)return json({ok:true});
    const statements=[db().prepare('INSERT INTO search_misses (day,query,count) VALUES (?,?,1) ON CONFLICT(day,query) DO UPDATE SET count=count+1').bind(kstDay(),q)];
    if(Math.random()<.02)statements.push(db().prepare('DELETE FROM search_misses WHERE day < ?').bind(kstDay(Date.now()-90*86400000)));
    await db().batch(statements);return json({ok:true});
  }
  if(resource==='moderation'){
    const admin=await requireAdmin();if(method==='GET'){const rows=await db().prepare(`SELECT r.id,r.target_kind,r.target_id,r.reason,r.status,r.created,u.name AS reporter_name,CASE WHEN r.target_kind='comment' THEN (SELECT body FROM comments WHERE id=r.target_id) WHEN r.target_kind='post' THEN (SELECT title || char(10) || body FROM posts WHERE id=r.target_id) ELSE (SELECT title || char(10) || description FROM projects WHERE id=r.target_id) END AS content,CASE WHEN r.target_kind='comment' THEN (SELECT target_kind FROM comments WHERE id=r.target_id) ELSE r.target_kind END AS content_kind,CASE WHEN r.target_kind='comment' THEN (SELECT target_id FROM comments WHERE id=r.target_id) ELSE r.target_id END AS content_id FROM reports r JOIN profiles u ON u.id=r.reporter_id ORDER BY (r.status='pending') DESC,r.created DESC LIMIT 100`).all();return json({reports:rows.results});}
    if(method==='PATCH'){const b=await body(request);const reportId=text(b.id,1,100,'신고');const report=await db().prepare("SELECT * FROM reports WHERE id=? AND status='pending'").bind(reportId).first();if(!report)throw new ApiError(404,'처리할 신고를 찾을 수 없습니다.');if(!['dismiss','hide'].includes(String(b.action)))throw new ApiError(400,'처리 방식을 확인해주세요.');
      if(b.action==='hide'){if(!['post','comment','project'].includes(String(report.target_kind)))throw new ApiError(400,'회원 신고는 운영자 대시보드에서 처리해주세요.');if(report.target_kind==='project'&&!String(report.target_id).startsWith('community-'))throw new ApiError(409,'기본 작품은 운영 소스에서 수정해주세요.');}
      await resolveReports(admin.id,String(report.target_kind),String(report.target_id),String(b.action),'',reportId);return json({ok:true});}
  }
  throw new ApiError(404,'지원하지 않는 요청입니다.');
}
async function handle(request:Request,context:Context){try{return await dispatch(request,context);}catch(error){return failure(error);}}
export const GET=handle;export const POST=handle;export const PUT=handle;export const PATCH=handle;export const DELETE=handle;
