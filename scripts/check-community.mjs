import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const origin=process.argv[2]||'http://127.0.0.1:5174';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Disposable integration fixtures are local only.');
const tag=randomUUID();const a='google:qa-admin-'+tag,b='google:qa-member-'+tag;
const actors=[{id:a,name:'Local Admin',role:'admin',token:randomBytes(32).toString('hex')},{id:b,name:'Local Member',role:'member',token:randomBytes(32).toString('hex')}];
const fixture=path.resolve('.sites-runtime/community-check.sql');mkdirSync(path.dirname(fixture),{recursive:true});
function sql(statements){writeFileSync(fixture,statements);const p=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file',fixture],{encoding:'utf8'});if(p.status!==0)throw Error('Local fixture SQL failed: '+p.stderr);}
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const setup=actors.map(u=>`INSERT INTO profiles(id,public_id,name,role,created,updated) VALUES(${quote(u.id)},${quote(randomUUID())},${quote(u.name)},${quote(u.role)},${Date.now()},${Date.now()}); INSERT INTO sessions(hash,user_id,expires) VALUES(${quote(createHash('sha256').update(u.token).digest('hex'))},${quote(u.id)},${Date.now()+3600000});`).join('\n');
const request=async(actor,url,method='GET',body,extra={})=>{const headers={...(actor?{Cookie:'vibeflix_session='+actor.token}:{}),...(method!=='GET'?{Origin:origin}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra};const response=await fetch(origin+url,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});let data;try{data=await response.json();}catch{data={};}return{status:response.status,data};};
const expect=async(promise,status)=>{const result=await promise;assert.equal(result.status,status,JSON.stringify(result.data));return result.data;};
const community=(actor,url,method,body,extra)=>request(actor,'/api/community/'+url,method,body,extra);
sql(setup);
try{
  const [A,B]=actors;
  assert.equal((await expect(request(null,'/api/session'),200)).user,null);
  const session=await expect(request(B,'/api/session'),200);assert.equal(session.user.name,'Local Member');assert.notEqual(session.user.id,B.id);assert.ok(!('email'in session.user));
  const listed=await expect(request(null,'/api/projects'),200);assert.ok(listed.projects.some(p=>p.id==='koiworld'));assert.ok(listed.projects.every(p=>!('owner_id'in p)));
  for(const [endpoint,method,payload] of [['posts','POST',{title:'No',body:'No'}],['comments','POST',{kind:'project',targetId:'koiworld',body:'No'}],['react','PUT',{kind:'project',targetId:'koiworld',active:true}],['ratings/koiworld','PUT',{score:5}],['bookmarks','PUT',{projectId:'koiworld',active:true}],['reports','POST',{kind:'project',targetId:'koiworld',reason:'No auth allowed'}]])await expect(community(null,endpoint,method,payload),401);
  await expect(community(B,'posts','POST',{title:'Wrong origin',body:'Wrong origin'}, {Origin:'https://other.example'}),403);
  const created=await expect(community(A,'posts','POST',{title:`QA ownership ${tag}`,body:'A public story. <script>not executed</script>',category:'question',projectId:'koiworld'}),201);const post=created.id;
  const publicPost=await expect(community(null,'posts/'+post),200);assert.equal(publicPost.post.owned,false);assert.ok(!('owner_id'in publicPost.post));
  await expect(community(B,'posts/'+post,'PATCH',{title:'Unauthorized edit',body:'not allowed'}),404);
  await expect(community(A,'posts/'+post,'PATCH',{title:`Edited QA ${tag}`,body:'Edited public story',category:'buildlog'}),200);
  const search=await expect(community(null,'posts?q='+encodeURIComponent(tag)),200);assert.ok(search.posts.some(p=>p.id===post));await expect(community(null,'posts?q='+encodeURIComponent("%'_\\")),200);
  await expect(community(B,'react','PUT',{kind:'post',targetId:post,active:true}),200);const repeated=await expect(community(B,'react','PUT',{kind:'post',targetId:post,active:true}),200);assert.equal(repeated.recommendations,1);
  const removed=await expect(community(B,'react','PUT',{kind:'post',targetId:post,active:false}),200);assert.equal(removed.recommendations,0);
  await expect(community(B,'ratings/koiworld','PUT',{score:5,review:'Great local test'}),200);const updated=await expect(community(B,'ratings/koiworld','PUT',{score:3,review:'Updated review'}),200);assert.equal(updated.myRating,3);
  await expect(community(A,'ratings/koiworld','PUT',{score:5}),200);const rating=await expect(community(null,'ratings/koiworld'),200);assert.ok(rating.stats.ratingCount>=2);assert.equal(rating.reviews.filter(r=>r.author_name==='Local Member').length,1);
  await expect(community(B,'ratings/koiworld','PUT',{score:6}),400);await expect(community(B,'ratings/godoftop','PUT',{score:5}),409);
  const root=await expect(community(B,'comments','POST',{kind:'post',targetId:post,body:'A comment from a second person'}),201);
  const reply=await expect(community(A,'comments','POST',{kind:'post',targetId:post,parentId:root.id,body:'A reply to the second person'}),201);
  await expect(community(B,'comments','POST',{kind:'post',targetId:post,parentId:reply.id,body:'A disallowed nested reply'}),400);
  await expect(community(B,'comments','POST',{kind:'project',targetId:'koiworld',parentId:root.id,body:'Wrong target'}),400);
  await expect(community(A,'comments/'+root.id,'PATCH',{body:'Unauthorized edit'}),404);await expect(community(B,'comments/'+root.id,'PATCH',{body:'Edited own comment'}),200);
  const notifications=await expect(community(B,'notifications'),200);assert.ok(notifications.notifications.some(n=>n.kind==='reply'&&n.target_id===post));
  await expect(community(B,'notifications','PATCH',{}),200);assert.equal((await expect(community(B,'notifications'),200)).unread,0);
  await expect(community(B,'comments/'+root.id,'DELETE'),200);const thread=await expect(community(null,`comments?kind=post&id=${post}`),200);assert.equal(thread.comments.find(c=>c.id===root.id).removed,true);assert.ok(thread.comments.some(c=>c.id===reply.id));
  await expect(community(B,'bookmarks','PUT',{projectId:'koiworld',active:true}),200);await expect(community(B,'bookmarks','PUT',{projectId:'koiworld',active:true}),200);assert.equal((await expect(community(B,'bookmarks'),200)).ids.filter(id=>id==='koiworld').length,1);assert.ok(!(await expect(community(A,'bookmarks'),200)).ids.includes('koiworld'));
  await expect(community(B,'reports','POST',{kind:'post',targetId:post,reason:'Disposable local moderation check'}),201);await expect(community(B,'reports','POST',{kind:'post',targetId:post,reason:'Duplicate local report'}),409);await expect(community(B,'moderation'),403);await expect(community(null,'moderation'),401);
  const reports=await expect(community(A,'moderation'),200);const report=reports.reports.find(r=>r.target_id===post);assert.ok(report.content.includes('Edited public story'));
  await expect(community(A,'moderation','PATCH',{id:report.id,action:'hide'}),200);await expect(community(null,'posts/'+post),404);await expect(community(B,'react','PUT',{kind:'post',targetId:post,active:true}),404);
  const project=await expect(request(A,'/api/projects','POST',{title:'Local integration project',creator:'Ignored untrusted name',type:'website',description:'A temporary public showcase for ownership tests.',url:`https://example.com/vibeflix-${tag}`}),201);const projectId=project.project.id;assert.equal(project.project.creator,A.name);
  await expect(request(B,'/api/projects/'+projectId,'DELETE'),404);await expect(request(B,'/api/projects/'+projectId,'PATCH',{restore:true}),404);
  await expect(request(A,'/api/projects/'+projectId,'DELETE'),200);await expect(request(A,'/api/projects/'+projectId,'PATCH',{restore:true}),200);
  await expect(community(B,'reports','POST',{kind:'project',targetId:projectId,reason:'A local-only project hide test'}),201);const projectReport=(await expect(community(A,'moderation'),200)).reports.find(r=>r.target_id===projectId);await expect(community(A,'moderation','PATCH',{id:projectReport.id,action:'hide'}),200);await expect(request(A,'/api/projects/'+projectId,'PATCH',{restore:true}),403);
  await expect(community(B,'profile','PATCH',{name:'Member updated',bio:'A saved profile'}),200);assert.equal((await expect(community(B,'profile'),200)).user.name,'Member updated');
  await expect(request(B,'/api/auth/google','POST',{idToken:'forged.token.value'}),401);
  await expect(request(B,'/api/auth/logout','POST',{}),200);assert.equal((await expect(request(B,'/api/session'),200)).user,null);assert.ok((await expect(request(A,'/api/session'),200)).user);
  console.log('PASS: public reading, two-user ownership, posts/search/edit, nested comment rules, reply notifications, soft removal, idempotent recommendations, 1–5 ratings/update, bookmarks, profiles, private reports, admin moderation, restoration protection, forged login rejection and session logout.');
}finally{
  const list=actors.map(u=>quote(u.id)).join(',');
  sql(`DELETE FROM notifications WHERE recipient_id IN (${list}) OR actor_id IN (${list}); DELETE FROM reports WHERE reporter_id IN (${list}); DELETE FROM comments WHERE owner_id IN (${list}); DELETE FROM posts WHERE owner_id IN (${list}); DELETE FROM projects WHERE owner_id IN (${list}); DELETE FROM reactions WHERE user_id IN (${list}); DELETE FROM ratings WHERE user_id IN (${list}); DELETE FROM bookmarks WHERE user_id IN (${list}); DELETE FROM sessions WHERE user_id IN (${list}); DELETE FROM limits WHERE ${actors.map(u=>'instr(id,'+quote(u.id+':')+')=1').join(' OR ')}; DELETE FROM profiles WHERE id IN (${list});`);
  try{unlinkSync(fixture);}catch{}
}
