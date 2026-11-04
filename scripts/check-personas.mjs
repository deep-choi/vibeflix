// Local-only integration check for the persona pass (migration 0016): creator-set 개발 중 works and launch alerts,
// spam guards, episode comments, Q&A 해결됨, followed-creator feed, profile links, rating distribution and
// owner-only images for drafts.   node scripts/check-personas.mjs http://127.0.0.1:5297
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const origin=process.argv[2]||'http://127.0.0.1:5174';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Disposable integration fixtures are local only.');
const tag=randomUUID().slice(0,8);const old=Date.now()-3*86400000;
// creator and reader are older accounts; fresh joined minutes ago (new-account limits)
const actors=[['creator',old],['reader',old],['fresh',Date.now()]].map(([key,created])=>({key,created,id:`google:qa-p-${key}-${tag}`,name:`QA ${key} ${tag}`,token:randomBytes(32).toString('hex'),publicId:randomUUID()}));
const [C,R,F]=actors;
const fixture=path.resolve('.sites-runtime/personas-check.sql');mkdirSync(path.dirname(fixture),{recursive:true});
function sql(statements){writeFileSync(fixture,statements);const p=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',process.env.VIBEFLIX_QA_PERSIST||'.wrangler/state','--file',fixture],{encoding:'utf8'});if(p.status!==0)throw new Error(p.stderr||p.stdout);}
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
sql(actors.map(u=>`INSERT INTO profiles(id,public_id,name,role,created,updated) VALUES(${q(u.id)},${q(u.publicId)},${q(u.name)},'member',${u.created},${u.created});INSERT INTO sessions(hash,user_id,expires) VALUES(${q(createHash('sha256').update(u.token).digest('hex'))},${q(u.id)},${Date.now()+86400000});INSERT INTO policy_acceptances(user_id,version,accepted) VALUES(${q(u.id)},'2026-10-21',${Date.now()});`).join('\n'));
async function request(actor,url,method='GET',body){
  for(let attempt=0;;attempt++){
    const response=await fetch(origin+url,{method,signal:AbortSignal.timeout(30000),headers:{...(actor?{Cookie:'vibeflix_session='+actor.token}:{}),...(method!=='GET'?{Origin:origin}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
    if(response.status===503&&attempt<2&&!(data&&data.error)){await new Promise(r=>setTimeout(r,300));continue;} // local runtime hiccup, never the app
    return {status:response.status,data,headers:response.headers};
  }
}
const expect=async(promise,status)=>{const r=await promise;assert.equal(r.status,status,`${status} expected, got ${r.status}: ${JSON.stringify(r.data).slice(0,300)}`);return r.data;};
const community=(a,u,m,b)=>request(a,'/api/community/'+u,m,b);
const notes=async a=>(await expect(community(a,'notifications'),200)).notifications;
const work=(a,extra={})=>request(a,'/api/projects','POST',{title:`QA ${tag} ${Math.random().toString(36).slice(2,6)}`,creator:'x',type:'game',description:'Persona check.',...extra});
try{
  // 인디 게임 개발자: announce while in development (no link), launch later → savers hear about it
  const dev=(await expect(work(C,{status:'upcoming'}),201)).project;assert.equal(dev.status,'upcoming');
  await expect(work(C,{status:'live'}),400); // a live game still needs its link
  await expect(community(R,'bookmarks','PUT',{projectId:dev.id,active:true}),200);
  await expect(request(C,'/api/projects/'+dev.id,'PATCH',{title:dev.title,type:'game',description:'Persona check.',status:'live',url:`https://example.com/qa-p-${tag}`}),200);
  assert.ok((await notes(R)).some(n=>n.kind==='launch'&&n.target_id===dev.id));
  console.log('PASS: creators can post 개발 중 works without a link; going live alerts everyone who saved it.');

  // 홍보 스팸 계정: no self-recommendation or self-rating, no repeated comments, smaller first-day allowance
  await expect(community(C,'react','PUT',{kind:'project',targetId:dev.id,active:true}),400);
  await expect(community(C,'ratings/'+dev.id,'PUT',{score:5}),400);
  await expect(community(R,'comments','POST',{kind:'project',targetId:dev.id,body:'Same text twice'}),201);
  await expect(community(R,'comments','POST',{kind:'project',targetId:dev.id,body:'Same text twice'}),429);
  await expect(work(F,{status:'upcoming'}),201);await expect(work(F,{status:'upcoming'}),201);await expect(work(F,{status:'upcoming'}),429);
  console.log('PASS: spam guards (self-recommend/rate, duplicate comments, first-day upload limit).');

  // 리뷰어: score distribution
  await expect(community(R,'ratings/'+dev.id,'PUT',{score:4,review:'재밌어요'}),200);
  assert.deepEqual((await expect(community(null,'ratings/'+dev.id),200)).distribution,[0,0,0,1,0]);
  console.log('PASS: rating distribution.');

  // 소설 독자 · 연재 창작자: comments on an episode reach the creator and link back to the episode
  const novel=(await expect(request(C,'/api/projects','POST',{title:`QA novel ${tag}`,creator:'x',type:'novel',description:'Serial.',details:{form:'serial',status:'ongoing',schedule:['wed','sat'],team:['하늘 · 그림']}}),201)).project;
  assert.deepEqual(novel.details?.schedule??['wed','sat'],['wed','sat']);
  const ep=await expect(request(C,`/api/projects/${novel.id}/entries`,'POST',{number:1,title:'첫 화',status:'published',content:[{type:'text',text:'본문'}]}),201);
  const page=await expect(request(null,`/works/${novel.id}`),200);assert.ok(page.includes('매주 수·토 연재')&&page.includes('하늘 · 그림'));
  await expect(community(R,'comments','POST',{kind:'entry',targetId:ep.id,body:'다음 화 기대돼요'}),201);
  assert.ok((await expect(community(null,`comments?kind=entry&id=${ep.id}`),200)).comments.some(c=>c.body==='다음 화 기대돼요'));
  assert.ok((await notes(C)).some(n=>n.target_kind==='entry'&&n.target_id===`${novel.id}/${ep.id}`));
  const episode=await expect(request(R,`/works/${novel.id}/e/${ep.id}`),200);assert.ok(episode.includes('id="entry-comments"')&&episode.includes('data-save-work'));
  console.log('PASS: episode comments with creator notification, schedule and team on the work page, save-for-next-episode prompt.');

  // 팬·단골: following a creator brings their new episodes into the feed
  await expect(request(R,'/api/follows/'+C.publicId,'PUT',{active:true}),200);
  const feed=await expect(community(R,'feed'),200);assert.ok(feed.items.some(i=>i.entry_id===ep.id)&&feed.items.some(i=>i.kind==='work'&&i.project_id===novel.id));
  console.log('PASS: followed-creator feed.');

  // 질문러: the asker accepts an answer; the person who answered is told
  const question=await expect(community(C,'posts','POST',{title:`QA question ${tag}`,body:'How do I deploy?',category:'question'}),201);
  const answer=await expect(community(R,'comments','POST',{kind:'post',targetId:question.id,body:'Use wrangler deploy.'}),201);
  await expect(community(R,`posts/${question.id}/solve`,'PUT',{commentId:answer.id}),404);
  await expect(community(C,`posts/${question.id}/solve`,'PUT',{commentId:answer.id}),200);
  assert.equal((await expect(community(null,'posts/'+question.id),200)).post.solved_comment,answer.id);
  assert.ok(!(await expect(community(null,'posts?category=question&unsolved=1&q='+encodeURIComponent(tag)),200)).posts.some(p=>p.id===question.id));
  assert.ok((await notes(R)).some(n=>n.kind==='accepted'));
  await expect(community(null,'posts?sort=active'),200);
  console.log('PASS: question 해결됨 with accepted answer, unsolved filter, active sort.');

  // 사이드 프로젝트 개발자: portfolio links on the creator page
  await expect(community(C,'profile','PATCH',{name:C.name,bio:'',links:'github.com/qa-person\nnot a url'}),400);
  await expect(community(C,'profile','PATCH',{name:C.name,bio:'',links:'github.com/qa-person'}),200);
  assert.ok((await expect(request(null,'/creators/'+C.publicId),200)).includes('https://github.com/qa-person'));
  console.log('PASS: profile links on the creator page.');

  // Privacy: a draft work's images are for its owner only and never publicly cached
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const draft=(await expect(work(C,{status:'upcoming',draft:true,content:[{type:'image',data:png}]}),201)).project;
  const img=draft.gallery[0];assert.ok(img,'draft has a body image');
  const asOwner=await request(C,img);assert.equal(asOwner.status,200);assert.match(asOwner.headers.get('cache-control'),/private/);
  assert.equal((await request(null,img)).status,404);assert.equal((await request(R,img)).status,404);
  console.log('PASS: draft images are owner-only and not publicly cached.');
}finally{
  const ids=actors.map(u=>q(u.id)).join(',');
  sql(`DELETE FROM project_images WHERE project_id IN (SELECT id FROM projects WHERE owner_id IN (${ids}));
DELETE FROM comments WHERE target_kind='entry' AND target_id IN (SELECT e.id FROM entries e JOIN projects p ON p.id=e.project_id WHERE p.owner_id IN (${ids}));
DELETE FROM entries WHERE project_id IN (SELECT id FROM projects WHERE owner_id IN (${ids}));
DELETE FROM ratings WHERE user_id IN (${ids});DELETE FROM bookmarks WHERE user_id IN (${ids});DELETE FROM follows WHERE follower_id IN (${ids}) OR creator_id IN (${ids});
DELETE FROM comments WHERE owner_id IN (${ids});DELETE FROM posts WHERE owner_id IN (${ids});DELETE FROM notifications WHERE recipient_id IN (${ids}) OR actor_id IN (${ids});
DELETE FROM work_stats WHERE project_id IN (SELECT id FROM projects WHERE owner_id IN (${ids}));DELETE FROM work_referrers WHERE project_id IN (SELECT id FROM projects WHERE owner_id IN (${ids}));
DELETE FROM projects WHERE owner_id IN (${ids});DELETE FROM sessions WHERE user_id IN (${ids});DELETE FROM limits WHERE ${actors.map(u=>'instr(id,'+q(u.id+':')+')=1').join(' OR ')};
DELETE FROM policy_acceptances WHERE user_id IN (${ids});DELETE FROM profiles WHERE id IN (${ids});`);
  try{unlinkSync(fixture);}catch{}
}
