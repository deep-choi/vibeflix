import assert from 'node:assert/strict';
const origin = process.argv[2] || 'http://127.0.0.1:5174';
if (!['127.0.0.1','localhost'].includes(new URL(origin).hostname)) throw new Error('Integration checks write disposable records and must only run against a local preview.');
const send=(path,options={})=>fetch(origin+path,options);
const jsonHeaders={'Content-Type':'application/json','Origin':origin};
const initial=await send('/api/projects');
assert.equal(initial.status,200,'Public catalog should be available');
const initialBody=await initial.json();
assert.ok(initialBody.projects.some(p=>p.id==='koiworld'));
assert.ok(initialBody.projects.some(p=>p.id==='dayflow'));
assert.ok(initialBody.projects.every(p=>!('owner_id' in p)&&!('ownerId' in p)),'Owner IDs must not be public');
assert.equal((await send('/api/projects',{method:'POST',headers:jsonHeaders,body:'{}'})).status,401,'Anonymous writes must be rejected');
assert.equal((await send('/api/projects',{method:'POST',headers:{...jsonHeaders,Origin:'https://other.example'},body:'{}'})).status,403,'Cross-site writes must be rejected');
const signIn=await send('/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=signIn.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
assert.ok(cookie,'Local mock sign-in should provide a cookie');
const headers={...jsonHeaders,Cookie:cookie};
const session=await (await send('/api/session',{headers:{Cookie:cookie}})).json();
assert.ok(session.user?.id,'Authenticated session should expose a user');
assert.ok(!('email' in session.user),'The client does not need an email address');
const invalid={title:'Test',creator:'QA',description:'Invalid private URL',type:'app',url:'http://127.0.0.1/private'};
assert.equal((await send('/api/projects',{method:'POST',headers,body:JSON.stringify(invalid)})).status,400,'Private service URLs must be rejected');
const record={title:'Disposable integration check',creator:'Local QA',description:'Local-only test record',type:'website',url:`https://example.com/vibeflix-qa-${crypto.randomUUID()}`};
let id;
try {
  const created=await send('/api/projects',{method:'POST',headers,body:JSON.stringify(record)});
  const payload=await created.json();
  assert.equal(created.status,201,JSON.stringify(payload));id=payload.project.id;
  const publicList=await (await send('/api/projects')).json();
  const publicProject=publicList.projects.find(p=>p.id===id);
  assert.ok(publicProject,'An anonymous visitor must see a signed-in creator’s project');
  assert.equal(publicProject.owned,false);
  assert.equal((await send('/api/projects',{method:'POST',headers,body:JSON.stringify(record)})).status,409,'Duplicate links must be rejected');
  assert.equal((await send(`/api/projects/${id}`,{method:'DELETE',headers:{Origin:origin}})).status,401,'Anonymous visitors cannot remove projects');
  const ownerList=await (await send('/api/projects',{headers:{Cookie:cookie}})).json();
  assert.equal(ownerList.projects.find(p=>p.id===id).owned,true);
} finally {
  if(id){assert.equal((await send(`/api/projects/${id}`,{method:'DELETE',headers})).status,200);const final=await(await send('/api/projects')).json();assert.ok(!final.projects.some(p=>p.id===id),'Hidden test record must disappear from the public catalog');}
}
console.log('PASS: public catalog, identity privacy, authentication, origin protection, input validation, shared persistence, duplicate prevention, ownership and soft removal.');
