// Local-only integration check for the operator and creator tools added in migration 0015:
// paged + cached catalog, report categories/grouping/outcomes, appeals, graduated sanctions, comment triage,
// launch alerts, link checks, creator stats, collections, scheduling, search misses, sitemap and robots.
//   node scripts/check-operator.mjs http://127.0.0.1:5297
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const origin=process.argv[2]||'http://127.0.0.1:5174';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Disposable integration fixtures are local only.');
const tag=randomUUID().slice(0,8);
const actors=['admin','author','reporter','other'].map(key=>({key,id:`google:qa-op-${key}-${tag}`,name:`QA ${key} ${tag}`,role:key==='admin'?'admin':'member',token:randomBytes(32).toString('hex'),publicId:randomUUID()}));
const [A,W,R,O]=actors; // operator, work author, reporter, second reporter
const fixture=path.resolve('.sites-runtime/operator-check.sql');mkdirSync(path.dirname(fixture),{recursive:true});
function sql(statements,json=false){writeFileSync(fixture,statements);const p=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',process.env.VIBEFLIX_QA_PERSIST||'.wrangler/state',...(json?['--json']:[]),'--file',fixture],{encoding:'utf8'});if(p.status!==0)throw new Error(p.stderr||p.stdout);return json?JSON.parse(p.stdout):null;}
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const session=u=>`INSERT INTO sessions(hash,user_id,expires) VALUES(${q(createHash('sha256').update(u.token).digest('hex'))},${q(u.id)},${Date.now()+86400000});`;
sql(actors.map(u=>`INSERT INTO profiles(id,public_id,name,role,created,updated) VALUES(${q(u.id)},${q(u.publicId)},${q(u.name)},${q(u.role)},${Date.now()},${Date.now()});${session(u)}INSERT INTO policy_acceptances(user_id,version,accepted) VALUES(${q(u.id)},'2026-10-21',${Date.now()});`).join('\n'));
// Local wrangler occasionally answers a request with an instant 503 that never reaches the app; retry those once.
async function request(actor,url,method='GET',body,extra={}){
  for(let attempt=0;;attempt++){
    const headers={...(actor?{Cookie:'vibeflix_session='+actor.token}:{}),...(method!=='GET'?{Origin:origin}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra};
    const response=await fetch(origin+url,{method,headers,signal:AbortSignal.timeout(30000),...(body!==undefined?{body:JSON.stringify(body)}:{})});
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
    if(response.status===503&&attempt<2&&!(data&&data.error)){await new Promise(r=>setTimeout(r,300));continue;}
    return {status:response.status,data,headers:response.headers};
  }
}
const expect=async(promise,status)=>{const r=await promise;assert.equal(r.status,status,`${status} expected, got ${r.status}: ${JSON.stringify(r.data).slice(0,300)}`);return r.data;};
const admin=(u,m,b)=>request(A,'/api/admin/'+u,m,b);
const community=(actor,u,m,b)=>request(actor,'/api/community/'+u,m,b);
const notes=async actor=>(await expect(community(actor,'notifications'),200)).notifications;
const filler=[];
try{
  // ── Catalog: pages instead of a 300 cap, and a short cache for signed-out visitors ──
  const now=Date.now();
  for(let i=0;i<230;i++)filler.push(`qa-op-${tag}-${i}`);
  sql(filler.map((id,i)=>`INSERT INTO projects(id,owner_id,title,creator,type,description,url,created,source) VALUES(${q(id)},${q(O.id)},${q('Filler '+i)},'QA','website','Paging check',NULL,${now-i},'community');`).join('\n'));
  // fixtures go in with raw SQL (which does not clear the signed-out cache), so page through as a signed-in member
  const first=await expect(request(A,'/api/projects'),200);
  assert.equal(first.pageSize,200);assert.equal(first.projects.length,200);assert.equal(first.next,200);assert.ok(Array.isArray(first.collections));
  const ids=new Set(first.projects.map(p=>p.id));let next=first.next;
  while(next!=null){const page=await expect(request(A,'/api/projects?offset='+next),200);assert.ok(!('collections' in page),'site extras ride on page 0 only');page.projects.forEach(p=>{assert.ok(!ids.has(p.id),'pages do not overlap');ids.add(p.id);});next=page.next;}
  assert.ok(filler.every(id=>ids.has(id)),'every work is reachable past the first 200');
  await request(null,'/api/projects');const cached=await request(null,'/api/projects');assert.equal(cached.headers.get('x-catalog-cache'),'hit');
  const signedIn=await request(W,'/api/projects');assert.equal(signedIn.headers.get('x-catalog-cache'),null,'signed-in visitors are never served the shared cache');
  sql(`DELETE FROM projects WHERE id IN (${filler.map(q).join(',')});`);filler.length=0;
  console.log('PASS: catalog paging beyond 200/300 works, page 0 extras, anonymous cache only.');

  // ── A work by W, with a bug report from R ──
  const work=(await expect(request(W,'/api/projects','POST',{title:`QA work ${tag}`,creator:'QA',type:'website',description:'Operator check work.',url:`https://example.com/qa-op-${tag}`}),201)).project.id;
  const bug=await expect(community(R,'comments','POST',{kind:'project',targetId:work,body:'Button does nothing on mobile',label:'bug'}),201);
  await expect(community(R,'triage/'+bug.id,'PUT',{status:'ack'}),404);
  await expect(community(W,'triage/'+bug.id,'PUT',{status:'fixed'}),200);
  const thread=await expect(community(null,`comments?kind=project&id=${encodeURIComponent(work)}`),200);
  assert.equal(thread.comments.find(c=>c.id===bug.id).status,'fixed');
  assert.ok((await notes(R)).some(n=>n.kind==='triage'&&n.target_kind==='work'&&n.target_id===work));
  console.log('PASS: creator triage of bug reports, commenter told, only the work owner may triage.');

  // ── Link check: operator verifies, a new link clears it ──
  await expect(admin('projects/'+encodeURIComponent(work),'PATCH',{action:'verify'}),200);
  assert.equal((await expect(request(W,'/api/projects'),200)).projects.find(p=>p.id===work).verified,true);
  await expect(request(W,'/api/projects/'+encodeURIComponent(work),'PATCH',{title:`QA work ${tag}`,creator:'QA',type:'website',description:'Operator check work.',url:`https://example.com/qa-op-moved-${tag}`}),200);
  assert.equal((await expect(request(W,'/api/projects'),200)).projects.find(p=>p.id===work).verified,false);
  console.log('PASS: operator link check, cleared when the owner changes the link.');

  // ── Launch alert: upcoming → live tells everyone who saved it ──
  const editable=(await expect(admin('projects?q='+encodeURIComponent(tag)),200)).projects.find(p=>p.id===work);
  const edit=status=>admin('projects/'+encodeURIComponent(work),'PATCH',{action:'edit',title:editable.title,creator:editable.creator,type:'website',status,url:status==='live'?`https://example.com/qa-op-moved-${tag}`:'',subtitle:'',description:editable.description,tags:[]});
  await expect(edit('upcoming'),200);
  await expect(community(O,'bookmarks','PUT',{projectId:work,active:true}),200);
  await expect(edit('live'),200);
  assert.ok((await notes(O)).some(n=>n.kind==='launch'&&n.target_id===work));
  console.log('PASS: launch alert to people who saved an upcoming work.');

  // ── Reports: categories, one alert per target, grouped, outcome notices, author told why ──
  await expect(community(R,'reports','POST',{kind:'project',targetId:work,category:'other',reason:'no'}),400);
  await expect(community(R,'reports','POST',{kind:'project',targetId:work,category:'malicious'}),201);
  await expect(community(O,'reports','POST',{kind:'project',targetId:work,category:'spam',reason:'Same link everywhere'}),201);
  assert.equal((await notes(A)).filter(n=>n.kind==='report'&&n.target_kind==='admin').length,1,'one operator alert per reported target');
  const reports=await expect(admin('reports'),200);const group=reports.groups.find(g=>g.target_id===work);
  assert.equal(group.count,2);assert.deepEqual(new Set(group.items.map(i=>i.category)),new Set(['malicious','spam']));
  assert.ok(reports.reports.some(r=>r.target_id===work&&r.category==='spam'),'flat list stays for older clients');
  await expect(admin('reports/target','PATCH',{targetKind:'project',targetId:work,action:'hide',note:'피싱 의심 링크'}),200);
  await expect(request(null,'/works/'+encodeURIComponent(work)),404);
  assert.ok((await notes(W)).some(n=>n.kind==='moderated'&&n.target_id===work&&n.excerpt.includes('피싱 의심 링크')));
  for(const reporter of [R,O])assert.ok((await notes(reporter)).some(n=>n.kind==='report-result'));
  console.log('PASS: report categories, single operator alert, grouped reports, author and reporters notified.');

  // ── Appeal: author asks again, operator restores ──
  await expect(community(R,'appeals','POST',{kind:'project',targetId:work,reason:'Not my work but trying anyway'}),404);
  await expect(community(W,'appeals','POST',{kind:'project',targetId:work,reason:'I replaced the link with the official one.'}),201);
  await expect(community(W,'appeals','POST',{kind:'project',targetId:work,reason:'Second appeal for the same thing'}),409);
  const appeal=(await expect(admin('appeals'),200)).appeals.find(a=>a.target_id===work);assert.ok(appeal.hide_note.includes('피싱'));
  await expect(admin('appeals/'+appeal.id,'PATCH',{action:'reject'}),400);
  await expect(admin('appeals/'+appeal.id,'PATCH',{action:'accept',note:'확인했어요'}),200);
  await expect(request(null,'/works/'+encodeURIComponent(work)),200);
  assert.ok((await notes(W)).some(n=>n.kind==='appeal-result'));
  console.log('PASS: appeals (owner only, one at a time, reason required to reject, accept restores).');

  // ── Sanctions: warning needs a reason, timed suspension signs out and lifts itself ──
  await expect(admin('users/'+O.publicId,'PATCH',{action:'sanction',kind:'warning'}),400);
  await expect(admin('users/'+O.publicId,'PATCH',{action:'sanction',kind:'warning',note:'도배 댓글'}),200);
  assert.ok((await notes(O)).some(n=>n.kind==='warning'&&n.excerpt.includes('도배 댓글')));
  await expect(admin('users/'+O.publicId,'PATCH',{action:'sanction',kind:'suspend7',note:'반복 도배'}),200);
  assert.equal((await expect(request(O,'/api/session'),200)).user,null,'suspension signs the member out');
  const listed=(await expect(admin('users?q='+encodeURIComponent(O.name)),200)).users[0];assert.equal(listed.suspended,true);assert.ok(listed.suspendedUntil>Date.now());assert.equal(listed.warnings,1);
  assert.equal((await expect(admin(`users/${O.publicId}/sanctions`),200)).sanctions.length,2);
  sql(`UPDATE profiles SET suspended_until=${Date.now()-1000} WHERE id=${q(O.id)};${session(O)}`);
  assert.ok((await expect(request(O,'/api/session'),200)).user,'an expired suspension lifts on the next visit');
  console.log('PASS: graduated sanctions, history, sign-out and automatic lift.');

  // ── Creator stats: referrer source and per-episode views (owner panel) ──
  await expect(request(null,'/works/'+encodeURIComponent(work),'GET',undefined,{Referer:'https://news.ycombinator.com/item?id=1','User-Agent':'Mozilla/5.0 QA'}),200);
  const sources=sql(`SELECT source,views FROM work_referrers WHERE project_id=${q(work)};`,true)[0].results;
  assert.ok(sources.some(s=>s.source==='news.ycombinator.com'));
  const ownerPage=await expect(request(W,'/studio/works/'+encodeURIComponent(work)),200);assert.ok(ownerPage.includes('어디서 왔나요')&&ownerPage.includes('news.ycombinator.com'));
  console.log('PASS: creator stats record where views came from.');

  // ── Collections, banner schedule, notice end, search misses, deletion queue, overview ──
  const col=await expect(admin('collections','POST',{title:`QA 기획전 ${tag}`,description:'테스트',projectIds:[work,'koiworld']}),201);
  assert.ok((await expect(request(null,'/api/projects'),200)).collections.some(c=>c.id===col.id&&c.projectIds.includes(work)),'collections show at once (cache cleared on write)');
  await expect(admin('collections/'+col.id,'PATCH',{action:'edit',title:`QA 기획전 ${tag}`,projectIds:[work],startsAt:new Date(Date.now()+86400000).toISOString()}),200);
  assert.ok(!(await expect(request(null,'/api/projects'),200)).collections.some(c=>c.id===col.id),'scheduled collections wait for their start');
  await expect(admin('collections/'+col.id,'DELETE'),200);
  await expect(admin('settings','PUT',{noticeUntil:new Date(Date.now()-60000).toISOString()}),400);
  await expect(community(null,'search-miss','POST',{q:`없는검색어${tag}`}),200);
  const overview=await expect(admin('overview'),200);
  assert.ok(overview.growth.searchMisses.some(m=>m.query===`없는검색어${tag}`));assert.ok('funnel' in overview.growth&&Array.isArray(overview.growth.categories));
  await expect(request(R,'/api/safety','POST',{action:'deletion',confirm:'삭제 요청'}),200);
  assert.ok((await expect(admin('deletions'),200)).requests.some(r=>r.id===R.publicId));
  await expect(admin('deletions/'+R.publicId,'DELETE',{}),200);
  assert.ok(!(await expect(admin('deletions'),200)).requests.some(r=>r.id===R.publicId));
  console.log('PASS: collections + schedule, notice end validation, search misses, deletion queue, growth overview.');

  // ── Sitemap and robots ──
  const sitemap=await expect(request(null,'/sitemap.xml'),200);assert.ok(sitemap.includes('/works/koiworld')&&sitemap.includes(`/works/${work}`)&&!sitemap.includes('/works/sample-'));
  const robots=await expect(request(null,'/robots.txt'),200);assert.ok(robots.includes('Sitemap: ')&&robots.includes('Disallow: /admin'));
  console.log('PASS: sitemap lists public works (no samples) and robots points to it.');
}finally{
  const ids=actors.map(u=>q(u.id)).join(',');
  const pubs=actors.map(u=>q(u.publicId)).join(',');
  sql(`${filler.length?`DELETE FROM projects WHERE id IN (${filler.map(q).join(',')});`:''}
DELETE FROM work_referrers WHERE project_id IN (SELECT id FROM projects WHERE owner_id IN (${ids}));
DELETE FROM work_stats WHERE project_id IN (SELECT id FROM projects WHERE owner_id IN (${ids}));
DELETE FROM appeals WHERE user_id IN (${ids});DELETE FROM sanctions WHERE user_id IN (${ids});
DELETE FROM reports WHERE reporter_id IN (${ids});DELETE FROM notifications WHERE recipient_id IN (${ids}) OR actor_id IN (${ids});
DELETE FROM comments WHERE owner_id IN (${ids});DELETE FROM bookmarks WHERE user_id IN (${ids});DELETE FROM projects WHERE owner_id IN (${ids});
DELETE FROM admin_actions WHERE admin_id IN (${ids});DELETE FROM search_misses WHERE query LIKE ${q('%'+tag)};DELETE FROM collections WHERE title LIKE ${q('%'+tag)};
DELETE FROM sessions WHERE user_id IN (${ids});DELETE FROM limits WHERE ${actors.map(u=>'instr(id,'+q(u.id+':')+')=1').join(' OR ')};
DELETE FROM deletion_requests WHERE user_id IN (${ids});DELETE FROM policy_acceptances WHERE user_id IN (${ids});DELETE FROM profiles WHERE id IN (${ids}) OR public_id IN (${pubs});`);
  try{unlinkSync(fixture);}catch{}
}
