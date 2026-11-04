// Security and caching regressions against a local build:
//   node scripts/check-security.mjs http://127.0.0.1:5297
// - ChatGPT Sites identity headers are ignored outside *.chatgpt.site (they used to sign anyone in, even as admin)
// - sign-in return addresses stay on this site
// - every Worker-rendered page sends the security headers; /admin can never be framed
// - every local .css/.js a page links carries the build version, and each such file has a long-cache rule
// - view/click counting is once per visitor per day and never counts the work's own creator
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const origin=process.argv[2]||'http://127.0.0.1:5174';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Disposable integration fixtures are local only.');

const wrangler=args=>spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',process.env.VIBEFLIX_QA_PERSIST||'.wrangler/state',...args],{encoding:'utf8'});
const fixture=path.resolve('.sites-runtime/security-check.sql');mkdirSync(path.dirname(fixture),{recursive:true});
function sql(statements){writeFileSync(fixture,statements);const p=wrangler(['--file',fixture]);if(p.status!==0)throw Error('Local fixture SQL failed: '+p.stderr);}
function query(statement){const p=wrangler(['--json','--command',statement]);if(p.status!==0)throw Error('Local query failed: '+p.stderr);const out=p.stdout;return JSON.parse(out.slice(out.indexOf('[')))[0].results;}
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";

const tag=randomUUID();const owner={id:'google:qa-sec-'+tag,name:'Security QA',token:randomBytes(32).toString('hex')};
sql(`INSERT INTO profiles(id,public_id,name,role,created,updated) VALUES(${quote(owner.id)},${quote(randomUUID())},${quote(owner.name)},'member',${Date.now()-30*86400000},${Date.now()});
INSERT INTO sessions(hash,user_id,expires) VALUES(${quote(createHash('sha256').update(owner.token).digest('hex'))},${quote(owner.id)},${Date.now()+3600000});
INSERT INTO policy_acceptances(user_id,version,accepted) VALUES(${quote(owner.id)},'2026-10-21',${Date.now()});`);

// Local wrangler sometimes answers an instant 503 that never reaches the app; retry only those (see check-community).
async function send(url,{method='GET',headers={},body,actor}={}){
  for(let attempt=0;;attempt++){
    const response=await fetch(origin+url,{method,redirect:'manual',signal:AbortSignal.timeout(30000),headers:{...(actor?{Cookie:'vibeflix_session='+actor.token}:{}),...(method!=='GET'?{Origin:origin}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    const text=await response.text();
    if(response.status===503&&!text.includes('"error"')&&attempt<2){await new Promise(r=>setTimeout(r,300));continue;}
    let data={};try{data=JSON.parse(text);}catch{}
    return {status:response.status,headers:response.headers,text,data};
  }
}
const settle=()=>new Promise(r=>setTimeout(r,700)); // counting runs in waitUntil, after the response
const stats=id=>query(`SELECT COALESCE(SUM(views),0) views,COALESCE(SUM(clicks),0) clicks FROM work_stats WHERE project_id=${quote(id)}`)[0];

try{
  // 1. Forged ChatGPT Sites identity headers
  const forged={'oai-authenticated-user-id':'attacker','oai-authenticated-user-email':'admin@example.com','oai-authenticated-user-full-name':'Forged'};
  assert.equal((await send('/api/session',{headers:forged})).data.user,null,'oai-authenticated-* headers must not sign anyone in on this host');
  assert.equal((await send('/api/admin/overview',{headers:forged})).status,401,'forged headers must not reach the operator API');
  assert.equal((await send('/api/community/notifications',{headers:forged})).status,401);
  for(const target of ['//evil.example','/\\evil.example','https://evil.example','/signin-with-chatgpt'])
    assert.equal((await send('/api/auth/chatgpt?return_to='+encodeURIComponent(target))).headers.get('location'),'/signin-with-chatgpt?return_to=%2F',`return_to ${target} must not leave the site`);
  assert.equal((await send('/api/auth/chatgpt?return_to='+encodeURIComponent('/works/koiworld?x=1'))).headers.get('location'),'/signin-with-chatgpt?return_to=%2Fworks%2Fkoiworld%3Fx%3D1');

  // 2. Security headers on every kind of rendered page
  const pages=['/','/works/koiworld','/terms','/privacy','/design-system','/admin'];
  const html={};
  for(const page of pages){
    const r=await send(page);assert.equal(r.status,200,page);html[page]=r.text;
    assert.equal(r.headers.get('x-content-type-options'),'nosniff',page);
    assert.match(r.headers.get('content-security-policy')||'',/object-src 'none'; base-uri 'self'; form-action 'self'/,page);
    assert.ok(r.headers.get('referrer-policy'),page);assert.match(r.headers.get('strict-transport-security')||'',/max-age=\d+/,page);
    assert.equal(r.headers.get('cross-origin-opener-policy'),'same-origin-allow-popups',page);
    assert.match(r.headers.get('permissions-policy')||'',/camera=\(\)/,page);
  }
  const admin=await send('/admin');
  assert.match(admin.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(admin.headers.get('x-frame-options'),'DENY');
  assert.match(admin.headers.get('x-robots-tag')||'',/noindex/);assert.match(admin.headers.get('cache-control')||'',/no-store/);
  assert.match((await send('/design-system')).headers.get('x-robots-tag')||'',/noindex/);
  assert.equal((await send('/sitemap.xml')).headers.get('x-content-type-options'),'nosniff');

  // 3. Versioned static assets + a long-cache rule for each of them
  const rules=readFileSync('public/_headers','utf8');
  const cached=new Set([...rules.matchAll(/^(\/[\w.-]+\.(?:css|js))\n\s+Cache-Control: public, max-age=31536000, immutable/gm)].map(m=>m[1]));
  for(const file of readdirSync('public').filter(f=>/\.(css|js)$/.test(f)))assert.ok(cached.has('/'+file),`public/_headers has no long-cache rule for /${file} — add it (pages link it with ?v=)`);
  let version;
  for(const [page,body] of Object.entries(html)){
    for(const [,ref] of body.matchAll(/\s(?:href|src)="([^"]+\.(?:css|js)(?:\?[^"]*)?)"/g)){
      if(/^(https?:)?\/\//.test(ref)||ref.startsWith('/_next/'))continue;
      const m=ref.match(/^(\/[\w./-]+\.(?:css|js))\?v=(\w+)$/);
      assert.ok(m,`${page} links ${ref} without the build version`);
      assert.ok(cached.has(m[1]),`${page} links ${m[1]} but public/_headers does not cache it`);
      version??=m[2];assert.equal(m[2],version,`${page} links a different build version`);
    }
  }
  assert.ok(version&&version!=='dev','pages must carry the real build version');

  // 4. Counting: once per visitor per day, never the creator
  const created=await send('/api/projects',{method:'POST',actor:owner,body:{title:'Security counting QA',creator:'x',type:'game',description:'Security check.',url:`https://example.com/vibeflix-sec-${tag}`}});
  const work=created.data.project;assert.ok(work?.id,'creating the disposable work failed: '+created.status+' '+created.text.slice(0,200));
  const visitor={'User-Agent':'Mozilla/5.0 SecurityQA/'+tag};
  for(let i=0;i<3;i++)await send(`/api/projects/${work.id}/hit?kind=view`,{method:'POST',headers:visitor});
  await send(`/works/${work.id}`,{headers:visitor}); // the full page counts as the same view
  for(let i=0;i<3;i++)await send(`/api/projects/${work.id}/hit?kind=click`,{method:'POST',headers:visitor});
  await settle();
  assert.deepEqual(stats(work.id),{views:1,clicks:1},'repeated views/clicks from one visitor count once a day');
  await send(`/api/projects/${work.id}/hit?kind=view`,{method:'POST',headers:{'User-Agent':'Mozilla/5.0 SecurityQA-other/'+tag}});
  await settle();assert.equal(stats(work.id).views,2,'a second visitor counts');
  for(let i=0;i<2;i++)await send(`/api/projects/${work.id}/hit?kind=view`,{method:'POST',actor:owner,headers:{'User-Agent':'Mozilla/5.0 SecurityQA-owner/'+tag}});
  await send(`/works/${work.id}`,{actor:owner,headers:{'User-Agent':'Mozilla/5.0 SecurityQA-owner/'+tag}});
  await settle();assert.equal(stats(work.id).views,2,'the creator opening their own work is not counted');
  assert.equal((await send(`/api/projects/${work.id}/hit?kind=view`,{method:'POST',headers:{...visitor,Origin:'https://other.example'}})).status,403);
  assert.equal((await send(`/api/projects/no-such-work/hit?kind=view`,{method:'POST',headers:visitor})).status,200);await settle();
  assert.equal(query("SELECT COUNT(*) n FROM work_stats WHERE project_id='no-such-work'")[0].n,0,'unknown works are not counted');
  const raw=query(`SELECT visitor FROM view_dedupe WHERE key=${quote('v:'+work.id)}`);
  assert.ok(raw.length>=2&&raw.every(r=>/^[0-9a-f]{16}$/.test(r.visitor)),'only a truncated hash is stored per visitor');

  console.log('PASS: forged ChatGPT identity headers rejected, same-site sign-in return addresses, security headers on every page, /admin unframeable, versioned long-cached assets, once-a-day view/click counting without the creator.');
}finally{
  const id=quote(owner.id);
  sql(`DELETE FROM work_stats WHERE project_id IN (SELECT id FROM projects WHERE owner_id=${id}); DELETE FROM work_referrers WHERE project_id IN (SELECT id FROM projects WHERE owner_id=${id}); DELETE FROM view_dedupe WHERE key IN (SELECT 'v:'||id FROM projects WHERE owner_id=${id}) OR key IN (SELECT 'c:'||id FROM projects WHERE owner_id=${id}); DELETE FROM projects WHERE owner_id=${id}; DELETE FROM sessions WHERE user_id=${id}; DELETE FROM policy_acceptances WHERE user_id=${id}; DELETE FROM limits WHERE instr(id,${quote(owner.id+':')})=1; DELETE FROM profiles WHERE id=${id};`);
  try{unlinkSync(fixture);}catch{}
}
