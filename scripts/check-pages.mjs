// Local-only integration check for the pages that replaced modals: writing pages (works, episodes, posts), the post
// page, who may open them, escaping, and the old addresses.   node scripts/check-pages.mjs http://127.0.0.1:5297
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const origin=process.argv[2]||'http://127.0.0.1:5174';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Disposable integration fixtures are local only.');
const tag=randomUUID().slice(0,8);const old=Date.now()-3*86400000;
const actors=['creator','reader'].map(key=>({key,id:`google:qa-pg-${key}-${tag}`,name:`QA ${key} ${tag}`,token:randomBytes(32).toString('hex'),publicId:randomUUID()}));
const [C,R]=actors;
const fixture=path.resolve('.sites-runtime/pages-check.sql');mkdirSync(path.dirname(fixture),{recursive:true});
function sql(statements){writeFileSync(fixture,statements);const p=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',process.env.VIBEFLIX_QA_PERSIST||'.wrangler/state','--file',fixture],{encoding:'utf8'});if(p.status!==0)throw new Error(p.stderr||p.stdout);}
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
sql(actors.map(u=>`INSERT INTO profiles(id,public_id,name,role,created,updated) VALUES(${q(u.id)},${q(u.publicId)},${q(u.name)},'member',${old},${old});INSERT INTO sessions(hash,user_id,expires) VALUES(${q(createHash('sha256').update(u.token).digest('hex'))},${q(u.id)},${Date.now()+86400000});INSERT INTO policy_acceptances(user_id,version,accepted) VALUES(${q(u.id)},'2026-10-21',${Date.now()});`).join('\n'));
async function request(actor,url,method='GET',body){
  for(let attempt=0;;attempt++){
    const response=await fetch(origin+url,{method,redirect:'manual',signal:AbortSignal.timeout(30000),headers:{...(actor?{Cookie:'vibeflix_session='+actor.token}:{}),...(method!=='GET'?{Origin:origin}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
    if(response.status===503&&attempt<2&&!(data&&data.error)){await new Promise(r=>setTimeout(r,300));continue;}
    return {status:response.status,data,headers:response.headers};
  }
}
const expect=async(promise,status)=>{const r=await promise;assert.equal(r.status,status,`${status} expected, got ${r.status}: ${JSON.stringify(r.data).slice(0,300)}`);return r.data;};
const location=async url=>{const r=await request(null,url);assert.equal(r.status,302,`${url} should redirect`);return r.headers.get('location');};
const newWork=(extra={})=>request(C,'/api/projects','POST',{title:`QA ${tag} ${Math.random().toString(36).slice(2,6)}`,creator:'x',type:'novel',description:'Pages check.',...extra});

try{
  // 1. Writing pages ask for a member and are never indexed
  assert.equal(await location('/works/new'),'/?login=1&next=%2Fworks%2Fnew');
  assert.equal(await location('/posts/new'),'/?login=1&next=%2Fposts%2Fnew');
  assert.equal(await location('/works/koiworld/edit'),'/?login=1&next=%2Fworks%2Fkoiworld%2Fedit');
  const form=await request(C,'/works/new');assert.equal(form.status,200);assert.ok(form.data.includes('id="work-form"')&&form.data.includes('id="editor-config"')&&form.data.includes('/work-editor.js'));assert.equal(form.headers.get('x-robots-tag'),'noindex');
  await expect(request(C,'/works/koiworld/edit'),404);
  console.log('PASS: writing pages send visitors to sign in and curated works stay out of the member editor.');

  // 2. First public work offers feedback; the edit page is the owner's alone and survives hostile titles
  const first=await expect(newWork({title:`</script><script>alert(1)</script>${tag}`}),201);assert.equal(first.firstWork,true);
  const second=await expect(newWork(),201);assert.equal(second.firstWork,false);
  const id=first.project.id,workPath=`/works/${encodeURIComponent(id)}`;
  const edit=await expect(request(C,`${workPath}/edit`),200);assert.ok(!edit.includes('</script><script>alert(1)'),'titles must not break out of the page');assert.ok(edit.includes('수정 내용 저장하기'));
  await expect(request(R,`${workPath}/edit`),404);
  const draft=await expect(newWork({draft:true}),201);assert.equal(draft.firstWork,false);
  assert.ok((await expect(request(C,`/works/${draft.project.id}/edit`),200)).includes('id="save-draft"'),'drafts can stay drafts');
  const owner=await expect(request(C,workPath),200);assert.ok(owner.includes(`${workPath}/edit`)&&owner.includes(`/studio/works/${encodeURIComponent(id)}`));assert.ok(!owner.includes('entry-dialog')&&!owner.includes('owner-stats'),'numbers live in the studio');
  const visitor=await expect(request(R,workPath),200);assert.ok(visitor.includes('data-report-kind="project"'),'a work can be reported from its page');
  console.log('PASS: first-work offer, owner-only edit page, escaped titles, report and owner links on the work page.');

  // Studio: every member, works or not
  assert.equal(await location('/studio'),'/?login=1&next=%2Fstudio');assert.equal(await location('/studio/works'),'/?login=1&next=%2Fstudio%2Fworks');
  const empty=await expect(request(R,'/studio'),200);assert.ok(empty.includes('첫 작품 올리기')&&empty.includes('/works/new?type=game'),'a member without works starts here');assert.equal((await request(R,'/studio')).headers.get('x-robots-tag'),'noindex');
  assert.ok((await expect(request(R,'/studio/works'),200)).includes('아직 올린 작품이 없어요'));
  assert.ok((await expect(request(C,'/works/new?type=novel'),200)).includes('<option value="novel" selected>'),'a category picked in the studio is preselected');
  const overview=await expect(request(C,'/studio'),200);assert.ok(overview.includes('확인할 일')&&overview.includes('임시 저장 · 이어서 쓰기')&&!overview.includes('<script>alert(1)'));
  const studioList=await expect(request(C,'/studio/works'),200);assert.ok(studioList.includes('data-work-filter="draft"')&&studioList.includes(`/studio/works/${encodeURIComponent(id)}`));
  await expect(request(R,`/studio/works/${encodeURIComponent(id)}`),404);await expect(request(C,'/studio/works/koiworld'),404);
  const manage=await expect(request(C,`/studio/works/${encodeURIComponent(id)}`),200);assert.ok(manage.includes('data-remove-work')&&manage.includes('id="feedback"')&&manage.includes('/e/new')&&manage.includes('어디서 왔나요'));
  // taking a work down and bringing it back both happen here
  await expect(request(C,`/api/projects/${encodeURIComponent(second.project.id)}`,'DELETE'),200);
  const removed=await expect(request(C,`/studio/works/${encodeURIComponent(second.project.id)}`),200);assert.ok(removed.includes('data-restore-work')&&!removed.includes('작품 정보 수정'));
  assert.ok((await expect(request(C,'/studio/works'),200)).includes('data-work-filter="removed"'));
  await expect(request(C,`/api/projects/${encodeURIComponent(second.project.id)}`,'PATCH',{restore:true}),200);
  console.log('PASS: the studio opens for every member, starts empty accounts on uploading, stays private and manages public state.');

  // 3. Episodes
  await expect(request(R,`${workPath}/e/new`),404);
  assert.ok((await expect(request(C,`${workPath}/e/new`),200)).includes('name="number"'));
  const ep=await expect(request(C,`/api/projects/${id}/entries`,'POST',{title:'첫 화',number:1,status:'published',content:[{type:'text',text:'본문'}]}),201);
  const epEdit=await expect(request(C,`${workPath}/e/${ep.id}/edit`),200);assert.ok(epEdit.includes('value="첫 화"')&&epEdit.includes('data-entry-delete'));
  await expect(request(R,`${workPath}/e/${ep.id}/edit`),404);
  await expect(request(C,`${workPath}/e/entry-missing/edit`),404);
  assert.ok((await expect(request(C,`${workPath}/e/${ep.id}`),200)).includes(`/e/${ep.id}/edit`));
  assert.ok((await expect(request(R,`${workPath}/e/${ep.id}`),200)).includes('id="entry-comments"'));
  console.log('PASS: episode writing pages are owner-only and reachable from the episode.');

  // 4. Posts have a page of their own
  const title=`<b>QA 글</b> ${tag}`;
  const post=await expect(request(C,'/api/community/posts','POST',{title,body:'본문입니다.\n<img src=x onerror=alert(1)>',category:'question',projectId:id}),201);
  const page=await request(null,`/posts/${post.id}`);assert.equal(page.status,200);assert.ok(page.data.includes('&lt;b&gt;QA 글')&&page.data.includes('&lt;img src=x')&&!page.data.includes('<img src=x'),'post text is escaped');
  assert.ok(page.data.includes('og:title')&&page.data.includes(`rel="canonical" href="${origin}/posts/${post.id}"`)&&page.data.includes('답변 기다림')&&page.data.includes('함께 소개한 작품'));
  assert.ok((await expect(request(C,`/posts/${post.id}`),200)).includes(`/posts/${post.id}/edit`));
  assert.ok((await expect(request(R,`/posts/${post.id}`),200)).includes('data-report-kind="post"'));
  await expect(request(R,`/posts/${post.id}/edit`),404);
  assert.ok((await expect(request(C,`/posts/${post.id}/edit`),200)).includes(`value="${id}" selected`),'the linked work is preselected');
  assert.ok((await expect(request(null,'/sitemap.xml'),200)).length>0);

  // the linked work can be changed and removed; older clients that do not send it keep it
  await expect(request(C,`/api/community/posts/${post.id}`,'PATCH',{title,body:'고친 본문',category:'question',projectId:second.project.id}),200);
  assert.equal((await expect(request(null,`/api/community/posts/${post.id}`),200)).post.project_id,second.project.id);
  await expect(request(C,`/api/community/posts/${post.id}`,'PATCH',{title,body:'고친 본문',category:'question'}),200);
  assert.equal((await expect(request(null,`/api/community/posts/${post.id}`),200)).post.project_id,second.project.id);
  await expect(request(C,`/api/community/posts/${post.id}`,'PATCH',{title,body:'고친 본문',category:'question',projectId:''}),200);
  assert.equal((await expect(request(null,`/api/community/posts/${post.id}`),200)).post.project_id,null);
  await expect(request(C,`/api/community/posts/${post.id}`,'PATCH',{title,body:'고친 본문',category:'question',projectId:'no-such-work'}),404);

  // a hidden post: its author reads why, nobody else sees it, and it cannot be edited
  sql(`UPDATE posts SET hidden_at=${Date.now()} WHERE id=${q(post.id)};`);
  const hidden=await expect(request(C,`/posts/${post.id}`),200);assert.ok(hidden.includes('운영자가 숨긴 글')&&hidden.includes(`#appeal=post:${post.id}`));
  await expect(request(null,`/posts/${post.id}`),404);await expect(request(C,`/posts/${post.id}/edit`),404);
  sql(`UPDATE posts SET hidden_at=NULL WHERE id=${q(post.id)};`);
  await expect(request(C,`/api/community/posts/${post.id}`,'DELETE'),200);await expect(request(null,`/posts/${post.id}`),404);
  console.log('PASS: post page, escaping, owner-only editing, linked work changes, hidden and removed posts.');

  // 5. Prefilled feedback post
  const feedback=await expect(request(C,`/posts/new?feedback=${encodeURIComponent(second.project.id)}`),200);assert.ok(feedback.includes('[피드백 요청]')&&feedback.includes(`value="${second.project.id}" selected`));

  // 6. Old addresses, and the home page without the old dialogs
  assert.equal(await location('/?post=abc'),'/posts/abc');assert.equal(await location('/?project=koiworld'),'/works/koiworld');
  assert.equal(await location('/?write=1'),'/posts/new');assert.equal(await location('/?upload=1'),'/works/new');assert.equal(await location('/?account-deletion=1'),'/account#settings');
  const home=await expect(request(null,'/'),200);for(const gone of ['upload-dialog','compose-dialog','post-dialog','report-dialog','detail-dialog'])assert.ok(!home.includes(gone),`${gone} should be gone`);
  assert.ok((await expect(request(C,'/account'),200)).includes('account-page'));
  console.log('PASS: old addresses redirect and the home page no longer carries the old dialogs.');
}finally{
  const ids=actors.map(u=>q(u.id)).join(',');
  sql(`DELETE FROM reactions WHERE user_id IN (${ids});DELETE FROM notifications WHERE recipient_id IN (${ids}) OR actor_id IN (${ids});
DELETE FROM project_images WHERE project_id IN (SELECT id FROM projects WHERE owner_id IN (${ids}));DELETE FROM entries WHERE project_id IN (SELECT id FROM projects WHERE owner_id IN (${ids}));
DELETE FROM comments WHERE owner_id IN (${ids});DELETE FROM posts WHERE owner_id IN (${ids});
DELETE FROM work_stats WHERE project_id IN (SELECT id FROM projects WHERE owner_id IN (${ids}));DELETE FROM work_referrers WHERE project_id IN (SELECT id FROM projects WHERE owner_id IN (${ids}));
DELETE FROM projects WHERE owner_id IN (${ids});DELETE FROM sessions WHERE user_id IN (${ids});DELETE FROM limits WHERE ${actors.map(u=>'instr(id,'+q(u.id+':')+')=1').join(' OR ')};
DELETE FROM policy_acceptances WHERE user_id IN (${ids});DELETE FROM profiles WHERE id IN (${ids});`);
  try{unlinkSync(fixture);}catch{}
}
