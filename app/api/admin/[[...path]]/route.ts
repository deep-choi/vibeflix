import seedCatalog from '../../../public-catalog';
import { ApiError, body, db, failure, json, origin, pageParams } from '../../../../lib/api';
import { requireAdmin, type Member } from '../../../../lib/auth';
import { getSettings, kstDay, logAction, purgeComments, purgePosts, purgeProjects, purgeUser, saveSettings } from '../../../../lib/admin';
import { COVER, genreTaxonomy, normalizeUrl, parseCover, parseGenres, projectTypes, publicUrl } from '../../../../lib/project-input';
import { PROJECT_COLUMNS, SOURCE_ORDER, isCuratedOrigin, listBanners, parseBannerImage, publicProject } from '../../../../lib/projects';

export const dynamic='force-dynamic';
type Context={params:Promise<{path?:string[]}>};
const IMAGE_BODY=1_200_000; // cover/banner data URLs
const count=async(sql:string,...bind:unknown[])=>Number((await db().prepare(sql).bind(...bind).first())?.n||0);
const like=(q:string)=>`%${q.replace(/[%_]/g,'')}%`;
const tables:Record<string,string>={post:'posts',comment:'comments',project:'projects'};
const str=(v:unknown,label:string,min:number,max:number)=>{const s=typeof v==='string'?v.trim():'';if(s.length<min||s.length>max)throw new ApiError(400,min?`${label}: ${min}~${max}자로 입력해주세요.`:`${label}: ${max}자 이내로 입력해주세요.`);return s;};
const note=(b:Record<string,unknown>)=>typeof b.note==='string'?b.note:'';
const confirmName=(b:Record<string,unknown>,expected:string)=>{if(typeof b.confirm!=='string'||b.confirm.trim()!==expected.trim())throw new ApiError(400,'확인 문구가 일치하지 않아요. 이름을 정확히 입력해주세요.');};

async function setHidden(kind:string,id:string,hidden:boolean){
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
    count('SELECT COUNT(*) n FROM profiles WHERE created>=?',dayStart),count("SELECT COUNT(*) n FROM projects WHERE source='community' AND created>=?",dayStart),count('SELECT COUNT(*) n FROM posts WHERE created>=?',dayStart),count('SELECT COUNT(*) n FROM comments WHERE created>=?',dayStart),
  ]);
  const since=kstDay(Date.now()-13*86400000);
  const views=await db().prepare('SELECT day,views FROM daily_views WHERE day>=? ORDER BY day').bind(since).all().catch(()=>({results:[] as Record<string,unknown>[]}));
  const visitors=await db().prepare('SELECT day,COUNT(*) AS n FROM daily_visitors WHERE day>=? GROUP BY day').bind(since).all().catch(()=>({results:[] as Record<string,unknown>[]}));
  const v=new Map(views.results.map(r=>[String(r.day),Number(r.views)]));const u=new Map(visitors.results.map(r=>[String(r.day),Number(r.n)]));
  const visits=Array.from({length:14},(_,i)=>{const day=kstDay(Date.now()-(13-i)*86400000);return {day,views:v.get(day)||0,visitors:u.get(day)||0};});
  return {counts:{users,admins,suspended,projects,hiddenProjects,posts,comments,pendingReports:reports},today:{users:newUsers,projects:newProjects,posts:newPosts,comments:newComments},visits};
}

/** Validates the operator's edit of a work. Curated works may be "upcoming" without a link. */
async function editProject(id:string,existing:Record<string,unknown>,b:Record<string,unknown>){
  const title=str(b.title,'작품 이름',1,60),creator=str(b.creator,'크리에이터',1,40),description=str(b.description,'작품 소개',1,1000),subtitle=str(b.subtitle,'한 줄 소개',0,120);
  const type=typeof b.type==='string'&&(projectTypes as readonly string[]).includes(b.type)?b.type:'';if(!type)throw new ApiError(400,'카테고리를 선택해주세요.');
  const status=b.status==='upcoming'||b.status==='sample'?String(b.status):'live';
  const rawUrl=typeof b.url==='string'?b.url.trim():'';const url=rawUrl?publicUrl(normalizeUrl(rawUrl)):'';
  if(rawUrl&&!url)throw new ApiError(400,'작품 링크는 공개된 http(s) 주소여야 해요.');
  if(!url&&status==='live'&&existing.source!=='sample')throw new ApiError(400,'공개 중인 작품에는 링크가 필요해요. 링크가 없으면 상태를 ‘공개 예정’으로 바꿔주세요.');
  if(url&&existing.source!=='catalog'&&await isCuratedOrigin(url,id))throw new ApiError(409,'기본 작품과 같은 사이트의 링크예요.');
  const genres=b.genres===undefined?JSON.parse(String(existing.genres||'[]')):parseGenres(type,b.genres);
  const tags=Array.isArray(b.tags)?b.tags.map(t=>String(t).trim()).filter(Boolean).slice(0,6).map(t=>t.slice(0,20)):JSON.parse(String(existing.tags||'[]'));
  // image omitted = keep, '' = remove, data URL = replace (a new thumbnail replaces the built-in card design)
  let image=String(existing.image||''),art=String(existing.art||'custom');
  if(typeof b.image==='string'){if(b.image&&!parseCover(b.image))throw new ApiError(400,`썸네일은 ${COVER.width}×${COVER.height}px의 PNG·JPG·WebP, ${COVER.maxBytes/1024}KB 이하여야 해요.`);image=b.image;if(b.image)art='custom';}
  try{await db().prepare('UPDATE projects SET title=?,creator=?,description=?,subtitle=?,type=?,status=?,url=?,tags=?,genres=?,image=?,art=? WHERE id=? AND deleted_at IS NULL').bind(title,creator,description,subtitle,type,status,url||null,JSON.stringify(tags),JSON.stringify(genres),image,art,id).run();}
  catch(error){if(error instanceof Error&&error.message.includes('UNIQUE'))throw new ApiError(409,'같은 링크의 작품이 이미 있어요.');throw error;}
}

const THEMES=['koi','fishing','dayflow','cover','custom'];
async function bannerFields(b:Record<string,unknown>,existing?:Record<string,unknown>){
  const title=str(b.title,'배너 제목',1,40),description=str(b.description,'설명',0,200),buttonLabel=str(b.buttonLabel,'버튼 문구',0,20);
  if(description.split('\n').length>3)throw new ApiError(400,'설명은 세 줄까지 쓸 수 있어요.');
  const buttonIcon=b.buttonIcon==='play'?'play':'none',theme=THEMES.includes(String(b.theme))?String(b.theme):'custom';
  const rawUrl=typeof b.url==='string'?b.url.trim():'';const url=!rawUrl?'':rawUrl.startsWith('/')&&!rawUrl.startsWith('//')?rawUrl.slice(0,500):publicUrl(normalizeUrl(rawUrl));
  if(rawUrl&&!url)throw new ApiError(400,'버튼 링크는 공개된 http(s) 주소 또는 /로 시작하는 경로여야 해요.');
  const projectId=typeof b.projectId==='string'?b.projectId.trim():'';
  if(projectId&&!(await db().prepare('SELECT 1 FROM projects WHERE id=? AND deleted_at IS NULL').bind(projectId).first()))throw new ApiError(400,'연결할 작품을 찾을 수 없어요.');
  let image=String(existing?.image||'');
  if(typeof b.image==='string'){if(b.image.startsWith('data:')){if(!parseBannerImage(b.image))throw new ApiError(400,'배너 이미지는 PNG·JPG·WebP, 700KB 이하여야 해요.');image=b.image;}else if(!b.image)image='';}
  // 'cover' may borrow the linked work's thumbnail; 'fishing' has its own built-in backdrop
  if(!image&&theme!=='fishing'&&!(theme==='cover'&&projectId))throw new ApiError(400,theme==='custom'?'직접 꾸미는 배너에는 배경 이미지가 필요해요.':theme==='cover'?'작품을 연결하거나 이미지를 올려주세요.':'이 디자인에는 오른쪽에 띄울 이미지가 필요해요.');
  return {projectId:projectId||null,title,description,buttonLabel,buttonIcon,url,theme,image};
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
      const rows=await db().prepare(`SELECT ${PROJECT_COLUMNS},(SELECT name FROM profiles WHERE profiles.id=projects.owner_id) AS owner_name FROM projects WHERE deleted_at IS NULL ${q?'AND (title LIKE ? OR creator LIKE ?)':''} ORDER BY ${SOURCE_ORDER}, sort, created DESC LIMIT 300`).bind(...(q?[like(q),like(q)]:[])).all();
      return json({pinned:s.pinned,genres:genreTaxonomy,projects:rows.results.map(r=>({...publicProject(r),subtitleRaw:r.subtitle||'',source:['catalog','sample'].includes(String(r.source))?String(r.source):'community',hidden:!!r.hidden_at,ownerName:r.owner_name,pinned:s.pinned.indexOf(String(r.id)),canRestoreDesign:r.source==='catalog'&&seedCatalog.some(seed=>seed.id===r.id&&(seed.art!==r.art||seed.image!==r.image))}))});
    }
    if(a){
      const existing=await db().prepare('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL').bind(a).first();
      if(!existing)throw new ApiError(404,'작품을 찾을 수 없습니다.');
      if(method==='DELETE'){const b=await body(request);confirmName(b,String(existing.title));await purgeProjects([a]);await logAction(admin.id,'project.delete','project',a,`${existing.title}${note(b)?' · '+note(b):''}`);return json({ok:true});}
      if(method==='PATCH'){
        const b=await body(request,IMAGE_BODY);const action=String(b.action);
        if(action==='hide'||action==='show')await setHidden('project',a,action==='hide');
        else if(action==='pin'||action==='unpin'){const s=await getSettings();const list=s.pinned.filter(id=>id!==a);if(action==='pin'){if(list.length>=10)throw new ApiError(400,'주목 작품은 최대 10개까지 고정할 수 있어요.');list.push(a);}await saveSettings({pinned:list});}
        else if(action==='move'){const s=await getSettings();const i=s.pinned.indexOf(a);const j=i+(Number(b.offset)<0?-1:1);if(i<0||j<0||j>=s.pinned.length)throw new ApiError(400,'더 이동할 수 없어요.');const list=[...s.pinned];[list[i],list[j]]=[list[j],list[i]];await saveSettings({pinned:list});}
        else if(action==='edit')await editProject(a,existing,b);
        else if(action==='restore-design'){const seed=seedCatalog.find(p=>p.id===a);if(!seed)throw new ApiError(400,'기본 디자인이 있는 작품이 아니에요.');await db().prepare('UPDATE projects SET art=?,image=? WHERE id=?').bind(seed.art,seed.image,a).run();}
        else throw new ApiError(400,'처리 방식을 확인해주세요.');
        await logAction(admin.id,`project.${action}`,'project',a,action==='edit'?String(b.title||''):note(b));return json({ok:true});
      }
    }
  }

  if(resource==='banners'){
    if(method==='GET'){
      const titles=new Map(((await db().prepare('SELECT id,title FROM projects WHERE deleted_at IS NULL').all()).results).map(r=>[String(r.id),String(r.title)]));
      return json({banners:(await listBanners(true)).map(b=>({...b,projectTitle:b.projectId?titles.get(b.projectId)||'(삭제된 작품)':''}))});
    }
    if(method==='POST'&&!a){
      const b=await body(request,IMAGE_BODY);if(await count('SELECT COUNT(*) n FROM banners')>=10)throw new ApiError(400,'배너는 최대 10개까지 만들 수 있어요.');
      const f=await bannerFields(b);const id=`banner-${crypto.randomUUID()}`;const now=Date.now();const sort=await count('SELECT COALESCE(MAX(sort)+1,0) n FROM banners');
      await db().prepare('INSERT INTO banners (id,project_id,title,description,button_label,button_icon,url,theme,image,sort,enabled,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)').bind(id,f.projectId,f.title,f.description,f.buttonLabel,f.buttonIcon,f.url,f.theme,f.image,sort,now,now).run();
      await logAction(admin.id,'banner.create','banner',id,f.title);return json({ok:true,id},201);
    }
    if(a){
      const existing=await db().prepare('SELECT * FROM banners WHERE id=?').bind(a).first();if(!existing)throw new ApiError(404,'배너를 찾을 수 없어요.');
      if(method==='DELETE'){await db().prepare('DELETE FROM banners WHERE id=?').bind(a).run();await logAction(admin.id,'banner.delete','banner',a,String(existing.title));return json({ok:true});}
      if(method==='PATCH'){
        const b=await body(request,IMAGE_BODY);const action=String(b.action);
        if(action==='edit'){const f=await bannerFields(b,existing);await db().prepare('UPDATE banners SET project_id=?,title=?,description=?,button_label=?,button_icon=?,url=?,theme=?,image=?,updated=? WHERE id=?').bind(f.projectId,f.title,f.description,f.buttonLabel,f.buttonIcon,f.url,f.theme,f.image,Date.now(),a).run();}
        else if(action==='enable'||action==='disable'){if(action==='disable'&&existing.enabled&&await count('SELECT COUNT(*) n FROM banners WHERE enabled=1')<=1)throw new ApiError(400,'배너는 하나 이상 켜져 있어야 해요.');await db().prepare('UPDATE banners SET enabled=?,updated=? WHERE id=?').bind(action==='enable'?1:0,Date.now(),a).run();}
        else if(action==='move'){
          const list=((await db().prepare('SELECT id FROM banners ORDER BY sort, created').all()).results).map(r=>String(r.id));const i=list.indexOf(a),j=i+(Number(b.offset)<0?-1:1);
          if(j<0||j>=list.length)throw new ApiError(400,'더 이동할 수 없어요.');[list[i],list[j]]=[list[j],list[i]];
          await db().batch(list.map((id,sort)=>db().prepare('UPDATE banners SET sort=? WHERE id=?').bind(sort,id)));
        }
        else throw new ApiError(400,'처리 방식을 확인해주세요.');
        await logAction(admin.id,`banner.${action}`,'banner',a,String(b.title||existing.title));return json({ok:true});
      }
    }
  }

  if(resource==='users'){
    if(method==='GET'){
      const {offset,take}=pageParams(url,50);
      const rows=await db().prepare(`SELECT u.public_id,u.id,u.name,u.role,u.suspended,u.created,EXISTS(SELECT 1 FROM deletion_requests d WHERE d.user_id=u.id) AS deletion_requested,(SELECT COUNT(*) FROM projects WHERE owner_id=u.id AND deleted_at IS NULL) AS projects,(SELECT COUNT(*) FROM posts WHERE owner_id=u.id AND deleted_at IS NULL) AS posts,(SELECT COUNT(*) FROM comments WHERE owner_id=u.id AND deleted_at IS NULL) AS comments FROM profiles u ${q?'WHERE u.name LIKE ?':''} ORDER BY u.created DESC LIMIT ? OFFSET ?`).bind(...(q?[like(q)]:[]),take,offset).all();
      return json({users:rows.results.map(r=>({id:r.public_id,name:r.name,provider:String(r.id).startsWith('google:')?'google':'chatgpt',role:r.role,suspended:!!r.suspended,deletionRequested:!!r.deletion_requested,created:r.created,projects:r.projects,posts:r.posts,comments:r.comments,self:r.id===admin.id}))});
    }
    if(a&&(method==='PATCH'||method==='DELETE')){
      const b=await body(request);
      const target=await db().prepare('SELECT id,role,name FROM profiles WHERE public_id=?').bind(a).first();if(!target)throw new ApiError(404,'회원을 찾을 수 없습니다.');
      if(target.id===admin.id)throw new ApiError(400,'내 계정에는 적용할 수 없어요.');
      const uid=String(target.id);
      if(method==='DELETE'){if(target.role==='admin')throw new ApiError(400,'운영자는 먼저 일반 회원으로 바꾼 뒤 삭제할 수 있어요.');confirmName(b,String(target.name));await purgeUser(uid);await logAction(admin.id,'user.delete','user',a,`${target.name}${note(b)?' · '+note(b):''}`);return json({ok:true});}
      const action=String(b.action);
      if(action==='suspend'){if(target.role==='admin')throw new ApiError(400,'운영자는 먼저 일반 회원으로 바꾼 뒤 정지할 수 있어요.');await db().batch([db().prepare('UPDATE profiles SET suspended=1,updated=? WHERE id=?').bind(Date.now(),uid),db().prepare('DELETE FROM sessions WHERE user_id=?').bind(uid)]);}
      else if(action==='unsuspend')await db().prepare('UPDATE profiles SET suspended=0,updated=? WHERE id=?').bind(Date.now(),uid).run();
      else if(action==='make-admin'||action==='make-member')await db().prepare('UPDATE profiles SET role=?,updated=? WHERE id=?').bind(action==='make-admin'?'admin':'member',Date.now(),uid).run();
      else throw new ApiError(400,'처리 방식을 확인해주세요.');
      await logAction(admin.id,`user.${action}`,'user',a,note(b));return json({ok:true});
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
    if(b2&&method==='DELETE'){
      const b=await body(request);const row=await db().prepare(`SELECT id FROM ${tables[kind]} WHERE id=?`).bind(b2).first();if(!row)throw new ApiError(404,'대상을 찾을 수 없습니다.');
      if(kind==='post')await purgePosts([b2]);else await purgeComments([b2]);
      await logAction(admin.id,`${kind}.delete`,kind,b2,note(b));return json({ok:true});
    }
    if(b2&&method==='PATCH'){
      const b=await body(request);const action=String(b.action);if(action!=='hide'&&action!=='show')throw new ApiError(400,'처리 방식을 확인해주세요.');
      await setHidden(kind,b2,action==='hide');await logAction(admin.id,`${kind}.${action}`,kind,b2,note(b));return json({ok:true});
    }
  }

  if(resource==='reports'){
    if(method==='GET'){
      const pending=url.searchParams.get('status')!=='all';
      const rows=await db().prepare(`SELECT r.id,r.target_kind,r.target_id,r.reason,r.status,r.created,u.name AS reporter_name,CASE WHEN r.target_kind='user' THEN (SELECT name || char(10) || bio FROM profiles WHERE public_id=r.target_id) WHEN r.target_kind='comment' THEN (SELECT body FROM comments WHERE id=r.target_id) WHEN r.target_kind='post' THEN (SELECT title || char(10) || body FROM posts WHERE id=r.target_id) ELSE (SELECT title || char(10) || description FROM projects WHERE id=r.target_id) END AS content FROM reports r JOIN profiles u ON u.id=r.reporter_id ${pending?"WHERE r.status='pending'":''} ORDER BY r.created DESC LIMIT 100`).all();
      return json({reports:rows.results.map(r=>({...r,content:r.content??'(삭제된 콘텐츠)'}))});
    }
    if(method==='PATCH'&&a){
      const b=await body(request);const action=String(b.action);if(action!=='hide'&&action!=='dismiss')throw new ApiError(400,'처리 방식을 확인해주세요.');
      const report=await db().prepare("SELECT * FROM reports WHERE id=? AND status='pending'").bind(a).first();if(!report)throw new ApiError(404,'처리할 신고를 찾을 수 없습니다.');
      if(action==='hide'){if(report.target_kind==='user'){const target=await db().prepare('SELECT id,role FROM profiles WHERE public_id=?').bind(report.target_id).first();if(!target||target.id===admin.id||target.role==='admin')throw new ApiError(400,'이용자 관리에서 확인해주세요.');await db().batch([db().prepare('UPDATE profiles SET suspended=1 WHERE id=?').bind(target.id),db().prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id)]);}else await setHidden(String(report.target_kind),String(report.target_id),true);}
      await db().prepare('UPDATE reports SET status=?,resolved_at=? WHERE id=?').bind(action==='hide'?'resolved':'dismissed',Date.now(),a).run();
      await logAction(admin.id,`report.${action}`,String(report.target_kind),String(report.target_id),note(b));return json({ok:true});
    }
  }

  // Sample placeholders (migration 0008): count them, or remove all of them in one go
  if(resource==='samples'){
    const ids=((await db().prepare("SELECT id FROM projects WHERE source='sample'").all()).results).map(r=>String(r.id));
    const marks=ids.map(()=>'?').join(',');
    if(method==='GET'){
      const posts=await count("SELECT COUNT(*) n FROM posts WHERE owner_id='system:sample'");
      const banners=ids.length?await count(`SELECT COUNT(*) n FROM banners WHERE project_id IN (${marks})`,...ids):0;
      return json({projects:ids.length,posts,banners});
    }
    if(method==='DELETE'){
      const b=await body(request);confirmName(b,'예시 삭제');
      if(ids.length)await db().prepare(`DELETE FROM banners WHERE project_id IN (${marks})`).bind(...ids).run(); // sample banners borrow the sample thumbnails
      await purgeProjects(ids);await purgeUser('system:sample');
      await logAction(admin.id,'samples.delete','site','samples',`작품 ${ids.length}개`);return json({ok:true});
    }
  }

  if(resource==='log'&&method==='GET'){
    const rows=await db().prepare('SELECT l.action,l.target_kind,l.target_id,l.note,l.created,u.name AS admin_name FROM admin_actions l LEFT JOIN profiles u ON u.id=l.admin_id ORDER BY l.created DESC LIMIT 100').all();
    return json({log:rows.results});
  }
  throw new ApiError(404,'지원하지 않는 요청입니다.');
}
async function handle(request:Request,context:Context){try{return await dispatch(request,context);}catch(error){return failure(error);}}
export const GET=handle;export const POST=handle;export const PUT=handle;export const PATCH=handle;export const DELETE=handle;
