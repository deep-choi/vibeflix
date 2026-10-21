import catalog from '../../../public-catalog';
import { ApiError, body, db, failure, json, origin, pageParams } from '../../../../lib/api';
import { requireAdmin, type Member } from '../../../../lib/auth';
import { getSettings, kstDay, logAction, saveSettings } from '../../../../lib/admin';

export const dynamic='force-dynamic';
type Context={params:Promise<{path?:string[]}>};
const count=async(sql:string,...bind:unknown[])=>Number((await db().prepare(sql).bind(...bind).first())?.n||0);
const isCatalog=(id:string)=>catalog.some(p=>p.id===id);
const like=(q:string)=>`%${q.replace(/[%_]/g,'')}%`;
const tables:Record<string,string>={post:'posts',comment:'comments',project:'projects'};

// Hide a post/comment/project. Catalog projects live in source, so they are hidden through settings instead.
async function setHidden(kind:string,id:string,hidden:boolean){
  if(kind==='project'&&isCatalog(id)){const s=await getSettings();const set=new Set(s.hiddenCatalog);hidden?set.add(id):set.delete(id);await saveSettings({hiddenCatalog:[...set]});return;}
  const table=tables[kind];if(!table)throw new ApiError(400,'처리할 수 없는 대상입니다.');
  const result=await db().prepare(`UPDATE ${table} SET hidden_at=? WHERE id=? AND deleted_at IS NULL`).bind(hidden?Date.now():null,id).run();
  if(!result.meta.changes)throw new ApiError(404,'대상을 찾을 수 없습니다.');
}

async function overview(){
  const dayStart=new Date(`${kstDay()}T00:00:00+09:00`).getTime();
  const [users,admins,suspended,projects,hiddenProjects,posts,comments,reports,newUsers,newProjects,newPosts,newComments]=await Promise.all([
    count('SELECT COUNT(*) n FROM profiles'),count("SELECT COUNT(*) n FROM profiles WHERE role='admin'"),count('SELECT COUNT(*) n FROM profiles WHERE suspended=1'),
    count('SELECT COUNT(*) n FROM projects WHERE deleted_at IS NULL AND hidden_at IS NULL'),count('SELECT COUNT(*) n FROM projects WHERE deleted_at IS NULL AND hidden_at IS NOT NULL'),
    count('SELECT COUNT(*) n FROM posts WHERE deleted_at IS NULL AND hidden_at IS NULL'),count('SELECT COUNT(*) n FROM comments WHERE deleted_at IS NULL AND hidden_at IS NULL'),
    count("SELECT COUNT(*) n FROM reports WHERE status='pending'"),
    count('SELECT COUNT(*) n FROM profiles WHERE created>=?',dayStart),count('SELECT COUNT(*) n FROM projects WHERE created>=?',dayStart),count('SELECT COUNT(*) n FROM posts WHERE created>=?',dayStart),count('SELECT COUNT(*) n FROM comments WHERE created>=?',dayStart),
  ]);
  const since=kstDay(Date.now()-13*86400000);
  const views=await db().prepare('SELECT day,views FROM daily_views WHERE day>=? ORDER BY day').bind(since).all().catch(()=>({results:[] as Record<string,unknown>[]}));
  const visitors=await db().prepare('SELECT day,COUNT(*) AS n FROM daily_visitors WHERE day>=? GROUP BY day').bind(since).all().catch(()=>({results:[] as Record<string,unknown>[]}));
  const v=new Map(views.results.map(r=>[String(r.day),Number(r.views)]));const u=new Map(visitors.results.map(r=>[String(r.day),Number(r.n)]));
  const visits=Array.from({length:14},(_,i)=>{const day=kstDay(Date.now()-(13-i)*86400000);return {day,views:v.get(day)||0,visitors:u.get(day)||0};});
  return {counts:{users,admins,suspended,projects:projects+catalog.length,hiddenProjects,posts,comments,pendingReports:reports},today:{users:newUsers,projects:newProjects,posts:newPosts,comments:newComments},visits};
}

async function dispatch(request:Request,context:Context){
  const {path=[]}=await context.params;const [resource,a,b2]=path;const method=request.method;const url=new URL(request.url);
  if(method!=='GET')origin(request);
  const admin:Member=await requireAdmin();
  const q=(url.searchParams.get('q')||'').trim().slice(0,100);

  if(resource==='overview'&&method==='GET')return json(await overview());

  if(resource==='settings'){
    if(method==='GET')return json({settings:await getSettings()});
    if(method==='PUT'){
      const b=await body(request);const patch:Record<string,unknown>={};
      if('notice' in b)patch.notice=typeof b.notice==='string'?b.notice.trim().slice(0,200):'';
      if('noticeUrl' in b){const v=typeof b.noticeUrl==='string'?b.noticeUrl.trim():'';if(v&&!/^https?:\/\/|^\//.test(v))throw new ApiError(400,'공지 링크는 http(s):// 또는 /로 시작해야 합니다.');patch.noticeUrl=v.slice(0,500);}
      if('contactEmail' in b){const v=typeof b.contactEmail==='string'?b.contactEmail.trim():'';if(v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))throw new ApiError(400,'문의 이메일 형식을 확인해주세요.');patch.contactEmail=v.slice(0,200);}
      await saveSettings(patch);await logAction(admin.id,'settings','site','settings',Object.keys(patch).join(','));
      return json({settings:await getSettings()});
    }
  }

  if(resource==='projects'){
    if(method==='GET'){
      const s=await getSettings();
      const rows=await db().prepare(`SELECT p.id,p.title,p.creator,p.type,p.url,p.created,p.hidden_at,u.name AS owner_name,u.public_id AS owner_id FROM projects p LEFT JOIN profiles u ON u.id=p.owner_id WHERE p.deleted_at IS NULL ${q?'AND (p.title LIKE ? OR p.creator LIKE ?)':''} ORDER BY p.created DESC LIMIT 200`).bind(...(q?[like(q),like(q)]:[])).all();
      const base=catalog.filter(p=>!q||p.title.includes(q)||p.creator.includes(q)).map(p=>({id:p.id,title:p.title,creator:p.creator,type:p.type,url:p.url,created:p.created,source:'catalog',status:p.status,hidden:s.hiddenCatalog.includes(p.id)}));
      const community=rows.results.map(r=>({id:String(r.id),title:r.title,creator:r.creator,type:r.type,url:r.url,created:r.created,source:'community',status:'live',hidden:!!r.hidden_at,ownerName:r.owner_name,ownerId:r.owner_id}));
      return json({projects:[...base,...community].map(p=>({...p,pinned:s.pinned.indexOf(p.id)})),pinned:s.pinned});
    }
    if(method==='PATCH'&&a){
      const b=await body(request);const action=String(b.action);
      if(!isCatalog(a)&&!(await db().prepare('SELECT 1 FROM projects WHERE id=? AND deleted_at IS NULL').bind(a).first()))throw new ApiError(404,'작품을 찾을 수 없습니다.');
      if(action==='hide'||action==='show')await setHidden('project',a,action==='hide');
      else if(action==='pin'||action==='unpin'){const s=await getSettings();const list=s.pinned.filter(id=>id!==a);if(action==='pin'){if(list.length>=10)throw new ApiError(400,'주목 작품은 최대 10개까지 고정할 수 있어요.');list.push(a);}await saveSettings({pinned:list});}
      else if(action==='move'){const s=await getSettings();const i=s.pinned.indexOf(a);const j=i+(Number(b.offset)<0?-1:1);if(i<0||j<0||j>=s.pinned.length)throw new ApiError(400,'더 이동할 수 없어요.');const list=[...s.pinned];[list[i],list[j]]=[list[j],list[i]];await saveSettings({pinned:list});}
      else throw new ApiError(400,'처리 방식을 확인해주세요.');
      await logAction(admin.id,`project.${action}`,'project',a,typeof b.note==='string'?b.note:'');return json({ok:true});
    }
  }

  if(resource==='users'){
    if(method==='GET'){
      const {offset,take}=pageParams(url,50);
      const rows=await db().prepare(`SELECT u.public_id,u.id,u.name,u.role,u.suspended,u.created,(SELECT COUNT(*) FROM projects WHERE owner_id=u.id AND deleted_at IS NULL) AS projects,(SELECT COUNT(*) FROM posts WHERE owner_id=u.id AND deleted_at IS NULL) AS posts,(SELECT COUNT(*) FROM comments WHERE owner_id=u.id AND deleted_at IS NULL) AS comments FROM profiles u ${q?'WHERE u.name LIKE ?':''} ORDER BY u.created DESC LIMIT ? OFFSET ?`).bind(...(q?[like(q)]:[]),take,offset).all();
      return json({users:rows.results.map(r=>({id:r.public_id,name:r.name,provider:String(r.id).startsWith('google:')?'google':'chatgpt',role:r.role,suspended:!!r.suspended,created:r.created,projects:r.projects,posts:r.posts,comments:r.comments,self:r.id===admin.id}))});
    }
    if(method==='PATCH'&&a){
      const b=await body(request);const action=String(b.action);
      const target=await db().prepare('SELECT id,role FROM profiles WHERE public_id=?').bind(a).first();if(!target)throw new ApiError(404,'회원을 찾을 수 없습니다.');
      if(target.id===admin.id)throw new ApiError(400,'내 계정에는 적용할 수 없어요.');
      const uid=String(target.id);
      if(action==='suspend'){if(target.role==='admin')throw new ApiError(400,'운영자는 먼저 일반 회원으로 바꾼 뒤 정지할 수 있어요.');await db().batch([db().prepare('UPDATE profiles SET suspended=1,updated=? WHERE id=?').bind(Date.now(),uid),db().prepare('DELETE FROM sessions WHERE user_id=?').bind(uid)]);}
      else if(action==='unsuspend')await db().prepare('UPDATE profiles SET suspended=0,updated=? WHERE id=?').bind(Date.now(),uid).run();
      else if(action==='make-admin'||action==='make-member')await db().prepare('UPDATE profiles SET role=?,updated=? WHERE id=?').bind(action==='make-admin'?'admin':'member',Date.now(),uid).run();
      else throw new ApiError(400,'처리 방식을 확인해주세요.');
      await logAction(admin.id,`user.${action}`,'user',a,typeof b.note==='string'?b.note:'');return json({ok:true});
    }
  }

  if(resource==='content'){
    const kind=a==='comments'?'comment':'post';
    if(method==='GET'){
      const status=url.searchParams.get('status')==='hidden'?'AND c.hidden_at IS NOT NULL':'';
      const sql=kind==='post'
        ?`SELECT c.id,c.title,substr(c.body,1,200) AS body,c.category,c.created,c.hidden_at,u.name AS author FROM posts c JOIN profiles u ON u.id=c.owner_id WHERE c.deleted_at IS NULL ${status} ${q?'AND (c.title LIKE ? OR c.body LIKE ?)':''} ORDER BY c.created DESC LIMIT 100`
        :`SELECT c.id,'' AS title,substr(c.body,1,200) AS body,c.target_kind AS category,c.target_id,c.created,c.hidden_at,u.name AS author FROM comments c JOIN profiles u ON u.id=c.owner_id WHERE c.deleted_at IS NULL ${status} ${q?'AND (c.body LIKE ? OR c.body LIKE ?)':''} ORDER BY c.created DESC LIMIT 100`;
      const rows=await db().prepare(sql).bind(...(q?[like(q),like(q)]:[])).all();
      return json({items:rows.results.map(r=>({...r,hidden:!!r.hidden_at}))});
    }
    if(method==='PATCH'&&b2){
      const b=await body(request);const action=String(b.action);if(action!=='hide'&&action!=='show')throw new ApiError(400,'처리 방식을 확인해주세요.');
      await setHidden(kind,b2,action==='hide');await logAction(admin.id,`${kind}.${action}`,kind,b2,typeof b.note==='string'?b.note:'');return json({ok:true});
    }
  }

  if(resource==='reports'){
    if(method==='GET'){
      const pending=url.searchParams.get('status')!=='all';
      const rows=await db().prepare(`SELECT r.id,r.target_kind,r.target_id,r.reason,r.status,r.created,u.name AS reporter_name,CASE WHEN r.target_kind='comment' THEN (SELECT body FROM comments WHERE id=r.target_id) WHEN r.target_kind='post' THEN (SELECT title || char(10) || body FROM posts WHERE id=r.target_id) ELSE (SELECT title || char(10) || description FROM projects WHERE id=r.target_id) END AS content FROM reports r JOIN profiles u ON u.id=r.reporter_id ${pending?"WHERE r.status='pending'":''} ORDER BY r.created DESC LIMIT 100`).all();
      return json({reports:rows.results.map(r=>({...r,content:r.content??catalog.find(p=>p.id===r.target_id)?.title??'(삭제된 콘텐츠)'}))});
    }
    if(method==='PATCH'&&a){
      const b=await body(request);const action=String(b.action);if(action!=='hide'&&action!=='dismiss')throw new ApiError(400,'처리 방식을 확인해주세요.');
      const report=await db().prepare("SELECT * FROM reports WHERE id=? AND status='pending'").bind(a).first();if(!report)throw new ApiError(404,'처리할 신고를 찾을 수 없습니다.');
      if(action==='hide')await setHidden(String(report.target_kind),String(report.target_id),true);
      await db().prepare('UPDATE reports SET status=?,resolved_at=? WHERE id=?').bind(action==='hide'?'resolved':'dismissed',Date.now(),a).run();
      await logAction(admin.id,`report.${action}`,String(report.target_kind),String(report.target_id),typeof b.note==='string'?b.note:'');return json({ok:true});
    }
  }

  if(resource==='log'&&method==='GET'){
    const rows=await db().prepare('SELECT l.action,l.target_kind,l.target_id,l.note,l.created,u.name AS admin_name FROM admin_actions l LEFT JOIN profiles u ON u.id=l.admin_id ORDER BY l.created DESC LIMIT 100').all();
    return json({log:rows.results});
  }
  throw new ApiError(404,'지원하지 않는 요청입니다.');
}
async function handle(request:Request,context:Context){try{return await dispatch(request,context);}catch(error){return failure(error);}}
export const GET=handle;export const PUT=handle;export const PATCH=handle;
