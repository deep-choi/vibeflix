'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const typeNames={website:'웹사이트',game:'게임',app:'앱',art:'그림·만화',video:'영상',novel:'소설'};
const postLabels={general:'자유 이야기',showcase:'작품 소개',buildlog:'개발 일지',question:'질문',feedback:'피드백',project:'작품 댓글',post:'게시글 댓글'};
const kindNames={post:'게시글',comment:'댓글',project:'작품',user:'회원',site:'사이트'};
const actionNames={'project.hide':'작품 숨김','project.show':'작품 다시 공개','project.pin':'주목 작품 고정','project.unpin':'주목 작품 해제','project.move':'주목 순서 변경','user.suspend':'회원 정지','user.unsuspend':'회원 정지 해제','user.make-admin':'운영자 지정','user.make-member':'운영자 해제','post.hide':'게시글 숨김','post.show':'게시글 다시 공개','comment.hide':'댓글 숨김','comment.show':'댓글 다시 공개','report.hide':'신고 처리 (콘텐츠 숨김)','report.dismiss':'신고 기각','settings':'사이트 설정 변경'};
const fmtDate=t=>t?new Date(Number(t)).toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}):'-';
const fmtTime=t=>t?new Date(Number(t)).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'-';
const main=$('#ad-main');
const state={view:'overview',q:'',contentKind:'posts',contentStatus:'all',reportStatus:'pending'};

async function api(path,method='GET',payload){
  const response=await fetch('/api/admin/'+path,{method,headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'요청을 처리하지 못했어요.');
  return data;
}
let toastTimer;
function toast(message){const t=$('#ad-toast');t.textContent=message;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},2600);}
function confirmAction({title,copy,ok='확인',danger=false}){
  const d=$('#ad-confirm');$('#ad-confirm-title').textContent=title;$('#ad-confirm-copy').textContent=copy;$('#ad-confirm-note').value='';
  const okButton=$('#ad-confirm-ok');okButton.textContent=ok;okButton.className=`ad-btn ${danger?'danger':'primary'}`;
  d.returnValue='';d.showModal();
  return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='ok'?{note:$('#ad-confirm-note').value.trim()}:null),{once:true}));
}
const badge=(label,kind='')=>`<span class="ad-badge ${kind}">${esc(label)}</span>`;
const empty=(copy)=>`<div class="ad-empty">${esc(copy)}</div>`;
const table=(head,rows)=>rows.length?`<div class="ad-table-wrap"><table class="ad-table"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`:'';
const errorBox=error=>`<div class="ad-empty">${esc(error.message)} <button class="ad-btn" data-reload>다시 불러오기</button></div>`;

// Runs an action button: optional confirm (with note), API call, toast, refresh.
async function act(button,{path,payload,confirm,done}){
  let note='';
  if(confirm){const answer=await confirmAction(confirm);if(!answer)return;note=answer.note;}
  button.disabled=true;
  try{await api(path,'PATCH',{...payload,note});toast(done);await refresh();refreshReportCount();}
  catch(error){toast(error.message);button.disabled=false;}
}

/* ───── 현황 ───── */
async function viewOverview(){
  main.innerHTML='<h1>현황</h1><p class="ad-sub">불러오는 중…</p>';
  const d=await api('overview');const c=d.counts,t=d.today;
  const tile=(label,value,note,extra='')=>`<div class="ad-tile ${extra}"><span>${label}</span><strong>${Number(value).toLocaleString('ko-KR')}</strong><small>${note}</small></div>`;
  main.innerHTML=`<h1>현황</h1><p class="ad-sub">오늘 ${new Date().toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'})} 기준</p>
  <div class="ad-tiles">
    ${tile('회원',c.users,`오늘 +${t.users} · 운영자 ${c.admins} · 정지 ${c.suspended}`)}
    ${tile('공개 작품',c.projects,`오늘 +${t.projects} · 숨김 ${c.hiddenProjects}`)}
    ${tile('게시글',c.posts,`오늘 +${t.posts}`)}
    ${tile('댓글',c.comments,`오늘 +${t.comments}`)}
    <button class="ad-tile ${c.pendingReports?'alert':''}" data-go="reports"><span>처리 대기 신고</span><strong>${c.pendingReports}</strong><small>${c.pendingReports?'눌러서 처리하기 →':'모두 처리했어요'}</small></button>
  </div>
  <section class="ad-section"><div class="ad-chart"><div class="ad-chart-head"><h2>방문자 · 최근 14일</h2><p>오늘 방문자 ${d.visits.at(-1).visitors.toLocaleString('ko-KR')}명 · 페이지뷰 ${d.visits.at(-1).views.toLocaleString('ko-KR')}</p></div><div id="ad-chart-plot"></div><div class="ad-tip" id="ad-tip" hidden></div>
  <details><summary>표로 보기</summary>${table(['날짜','방문자','페이지뷰'],d.visits.slice().reverse().map(v=>`<tr><td>${v.day}</td><td class="num">${v.visitors}</td><td class="num">${v.views}</td></tr>`))}</details>
  <p class="ad-sub" style="margin:10px 0 0;font-size:12px">홈 화면 방문 기준 · IP를 저장하지 않고 하루 단위로만 같은 방문자를 구분해요.</p></div></section>`;
  drawVisits(d.visits);
  window.onresize=()=>drawVisits(d.visits);
}
function drawVisits(visits){
  const plot=$('#ad-chart-plot');if(!plot)return;
  const W=Math.max(280,plot.clientWidth),H=200,pad={l:34,r:8,t:20,b:26};
  const max=Math.max(...visits.map(v=>v.visitors));const top=Math.max(4,Math.ceil(max/4)*4);
  const ih=H-pad.t-pad.b,step=(W-pad.l-pad.r)/visits.length,bw=Math.min(24,step*.6),base=pad.t+ih;
  const y=v=>base-(v/top)*ih;
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 14일 일별 방문자 수">`;
  for(const g of [0,top/2,top])svg+=`<line class="grid" x1="${pad.l}" x2="${W-pad.r}" y1="${y(g)}" y2="${y(g)}"/><text class="axis" x="${pad.l-8}" y="${y(g)+4}" text-anchor="end">${g}</text>`;
  const maxIndex=visits.findIndex(v=>v.visitors===max);
  visits.forEach((v,i)=>{
    const x=pad.l+i*step+(step-bw)/2,h=base-y(v.visitors),r=Math.min(4,h,bw/2),t=base-h;
    svg+=`<rect class="hit" data-i="${i}" x="${pad.l+i*step}" y="${pad.t}" width="${step}" height="${ih}"/>`;
    svg+=h>0?`<path class="bar" d="M${x},${base}V${t+r}Q${x},${t} ${x+r},${t}H${x+bw-r}Q${x+bw},${t} ${x+bw},${t+r}V${base}Z"/>`:'<path class="bar" d=""/>';
    if(v.visitors>0&&(i===maxIndex||i===visits.length-1))svg+=`<text class="value" x="${x+bw/2}" y="${t-6}" text-anchor="middle">${v.visitors}</text>`;
    if(i%2===1||i===visits.length-1)svg+=`<text class="axis" x="${x+bw/2}" y="${H-6}" text-anchor="middle">${i===visits.length-1?'오늘':v.day.slice(5).replace('-','/')}</text>`;
  });
  plot.innerHTML=svg+'</svg>';
  const tip=$('#ad-tip');
  $$('.hit',plot).forEach(hit=>{
    hit.addEventListener('mouseenter',()=>{const v=visits[hit.dataset.i];const box=hit.getBoundingClientRect(),wrap=plot.parentElement.getBoundingClientRect();tip.innerHTML=`<b>${v.day}</b>방문자 ${v.visitors}명<br>페이지뷰 ${v.views}`;tip.style.left=`${box.left-wrap.left+box.width/2}px`;tip.style.top=`${y(v.visitors)+plot.offsetTop-8}px`;tip.hidden=false;});
    hit.addEventListener('mouseleave',()=>{tip.hidden=true;});
  });
}

/* ───── 작품 ───── */
async function viewProjects(){
  main.innerHTML=`<h1>작품</h1><p class="ad-sub">숨기면 사이트에서 바로 사라지고, 다시 공개할 수 있어요. 주목 작품은 홈 ‘지금, 주목할 바이브’ 맨 앞에 순서대로 나와요.</p>
  <div id="ad-pinned"></div><div class="ad-toolbar"><input type="search" id="ad-q" placeholder="작품 이름 또는 크리에이터 검색" value="${esc(state.q)}"></div><div id="ad-list"></div>`;
  bindSearch(loadProjects);await loadProjects();
}
async function loadProjects(){
  const d=await api('projects?q='+encodeURIComponent(state.q));const byId=new Map(d.projects.map(p=>[p.id,p]));
  const pinned=d.pinned.map(id=>byId.get(id)||{id,title:id,missing:true});
  $('#ad-pinned').innerHTML=pinned.length&&!state.q?`<section class="ad-section" style="margin-top:0;margin-bottom:24px"><h2>주목 작품 순서</h2>${table(['순서','작품',''],pinned.map((p,i)=>`<tr><td class="num">${i+1}</td><td><span class="title">${esc(p.title)}</span>${p.hidden?` ${badge('숨김 상태','off')}`:''}</td><td><div class="ad-actions"><button class="ad-btn icon" data-move="${esc(p.id)}" data-offset="-1" aria-label="위로" ${i===0?'disabled':''}>↑</button><button class="ad-btn icon" data-move="${esc(p.id)}" data-offset="1" aria-label="아래로" ${i===pinned.length-1?'disabled':''}>↓</button><button class="ad-btn" data-project="${esc(p.id)}" data-action="unpin">해제</button></div></td></tr>`))}</section>`:'';
  $('#ad-list').innerHTML=table(['작품','카테고리','출처','등록일','상태',''],d.projects.map(p=>`<tr>
    <td><span class="title">${esc(p.title)}</span><span class="meta">${esc(p.creator)}${p.url?` · <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.url.replace(/^https?:\/\//,'').slice(0,40))} ↗</a>`:''}</span></td>
    <td>${esc(typeNames[p.type]||p.type)}</td>
    <td>${p.source==='catalog'?badge('기본 작품','plain'):badge(`커뮤니티 · ${p.ownerName||'알 수 없음'}`,'plain')}</td>
    <td class="num">${p.source==='catalog'?'-':fmtDate(p.created)}</td>
    <td>${p.hidden?badge('숨김','off'):p.status==='upcoming'?badge('공개 예정'):badge('공개','ok')} ${p.pinned>=0?badge(`주목 ${p.pinned+1}`,'pin'):''}</td>
    <td><div class="ad-actions">${p.pinned>=0?`<button class="ad-btn" data-project="${esc(p.id)}" data-action="unpin">주목 해제</button>`:`<button class="ad-btn" data-project="${esc(p.id)}" data-action="pin" ${p.hidden?'disabled':''}>주목 고정</button>`}${p.hidden?`<button class="ad-btn" data-project="${esc(p.id)}" data-action="show">다시 공개</button>`:`<button class="ad-btn danger" data-project="${esc(p.id)}" data-action="hide" data-title="${esc(p.title)}">숨기기</button>`}</div></td></tr>`))||empty(state.q?'검색 결과가 없어요.':'작품이 없어요.');
}

/* ───── 회원 ───── */
async function viewUsers(){
  main.innerHTML=`<h1>회원</h1><p class="ad-sub">정지하면 즉시 로그아웃되고 다시 로그인할 수 없어요. 이메일은 개인정보 보호를 위해 저장하지 않아요.</p>
  <div class="ad-toolbar"><input type="search" id="ad-q" placeholder="닉네임 검색" value="${esc(state.q)}"></div><div id="ad-list"></div>`;
  bindSearch(loadUsers);await loadUsers();
}
async function loadUsers(){
  const d=await api('users?limit=50&q='+encodeURIComponent(state.q));
  $('#ad-list').innerHTML=table(['닉네임','로그인','권한','상태','가입일','작품 · 글 · 댓글',''],d.users.map(u=>`<tr>
    <td><span class="title">${esc(u.name)}</span>${u.self?` ${badge('나','pin')}`:''}</td>
    <td>${u.provider==='google'?'Google':'ChatGPT'}</td>
    <td>${u.role==='admin'?badge('운영자','pin'):badge('회원','plain')}</td>
    <td>${u.suspended?badge('정지','off'):badge('정상','ok')}</td>
    <td class="num">${fmtDate(u.created)}</td>
    <td class="num">${u.projects} · ${u.posts} · ${u.comments}</td>
    <td><div class="ad-actions">${u.self?'':`${u.role==='admin'?`<button class="ad-btn" data-user="${esc(u.id)}" data-action="make-member" data-name="${esc(u.name)}">운영자 해제</button>`:`<button class="ad-btn" data-user="${esc(u.id)}" data-action="make-admin" data-name="${esc(u.name)}">운영자 지정</button>`}${u.suspended?`<button class="ad-btn" data-user="${esc(u.id)}" data-action="unsuspend" data-name="${esc(u.name)}">정지 해제</button>`:`<button class="ad-btn danger" data-user="${esc(u.id)}" data-action="suspend" data-name="${esc(u.name)}" ${u.role==='admin'?'disabled title="운영자는 먼저 해제하세요"':''}>정지</button>`}`}</div></td></tr>`))||empty(state.q?'검색 결과가 없어요.':'아직 회원이 없어요.');
}

/* ───── 게시글 · 댓글 ───── */
async function viewContent(){
  main.innerHTML=`<h1>게시글 · 댓글</h1><p class="ad-sub">숨긴 콘텐츠는 작성자를 포함해 누구에게도 보이지 않아요.</p>
  <div class="ad-toolbar"><div class="ad-seg">${[['posts','게시글'],['comments','댓글']].map(([k,l])=>`<button data-kind="${k}" class="${state.contentKind===k?'active':''}">${l}</button>`).join('')}</div><div class="ad-seg">${[['all','전체'],['hidden','숨김만']].map(([k,l])=>`<button data-status="${k}" class="${state.contentStatus===k?'active':''}">${l}</button>`).join('')}</div><input type="search" id="ad-q" placeholder="내용 검색" value="${esc(state.q)}"></div><div id="ad-list"></div>`;
  bindSearch(loadContent);await loadContent();
}
async function loadContent(){
  const d=await api(`content/${state.contentKind}?status=${state.contentStatus}&q=${encodeURIComponent(state.q)}`);const kind=state.contentKind==='posts'?'post':'comment';
  $('#ad-list').innerHTML=table(['내용','작성자','분류','작성일','상태',''],d.items.map(c=>`<tr>
    <td>${c.title?`<span class="title">${esc(c.title)}</span>`:''}<span class="excerpt">${esc(c.body)}</span></td>
    <td>${esc(c.author)}</td><td>${esc(postLabels[c.category]||c.category)}</td><td class="num">${fmtTime(c.created)}</td>
    <td>${c.hidden?badge('숨김','off'):badge('공개','ok')}</td>
    <td><div class="ad-actions">${c.hidden?`<button class="ad-btn" data-content="${esc(c.id)}" data-kind="${kind}" data-action="show">다시 공개</button>`:`<button class="ad-btn danger" data-content="${esc(c.id)}" data-kind="${kind}" data-action="hide">숨기기</button>`}</div></td></tr>`))||empty('표시할 콘텐츠가 없어요.');
}

/* ───── 신고 ───── */
async function viewReports(){
  main.innerHTML=`<h1>신고</h1><p class="ad-sub">‘콘텐츠 숨기기’는 신고된 대상을 숨기고 신고를 처리 완료로 바꿔요. 기본 작품도 숨길 수 있어요.</p>
  <div class="ad-toolbar"><div class="ad-seg">${[['pending','처리 대기'],['all','전체']].map(([k,l])=>`<button data-report-status="${k}" class="${state.reportStatus===k?'active':''}">${l}</button>`).join('')}</div></div><div id="ad-list"></div>`;
  await loadReports();
}
async function loadReports(){
  const d=await api('reports?status='+state.reportStatus);
  const statusBadge=s=>s==='pending'?badge('대기','off'):s==='resolved'?badge('숨김 처리','ok'):badge('기각','plain');
  $('#ad-list').innerHTML=table(['대상','신고된 내용','신고 사유','신고자 · 접수','상태',''],d.reports.map(r=>`<tr>
    <td>${badge(kindNames[r.target_kind]||r.target_kind,'plain')}</td><td><span class="excerpt">${esc(r.content)}</span></td><td><span class="excerpt">${esc(r.reason)}</span></td>
    <td>${esc(r.reporter_name)}<span class="meta">${fmtTime(r.created)}</span></td><td>${statusBadge(r.status)}</td>
    <td><div class="ad-actions">${r.status==='pending'?`<button class="ad-btn danger" data-report="${esc(r.id)}" data-action="hide">콘텐츠 숨기기</button><button class="ad-btn" data-report="${esc(r.id)}" data-action="dismiss">기각</button>`:''}</div></td></tr>`))||empty(state.reportStatus==='pending'?'처리할 신고가 없어요.':'접수된 신고가 없어요.');
}

/* ───── 사이트 설정 ───── */
async function viewSettings(){
  const {settings:s}=await api('settings');
  main.innerHTML=`<h1>사이트 설정</h1><p class="ad-sub">저장하면 사이트에 바로 반영돼요.</p>
  <form class="ad-card" id="ad-notice"><h2>공지 띠</h2><p>모든 페이지 상단에 한 줄로 보여요. 비워두면 숨겨져요.</p>
    <label class="ad-field">공지 문구 <small>최대 200자</small><input name="notice" maxlength="200" value="${esc(s.notice)}" placeholder="예: 10월 25일 새벽 2시~3시 점검이 있어요."></label>
    <label class="ad-field">링크 <small>선택 · https:// 또는 /로 시작</small><input name="noticeUrl" maxlength="500" value="${esc(s.noticeUrl)}" placeholder="https://"></label>
    <button class="ad-btn primary">공지 저장</button></form>
  <form class="ad-card" id="ad-contact"><h2>운영자 문의 이메일</h2><p>개인정보처리방침과 이용약관의 문의처로 공개돼요. 공개해도 괜찮은 주소를 넣어주세요.</p>
    <label class="ad-field">이메일<input name="contactEmail" type="email" maxlength="200" value="${esc(s.contactEmail)}" placeholder="contact@example.com"></label>
    <button class="ad-btn primary">이메일 저장</button></form>`;
  for(const form of $$('form',main))form.addEventListener('submit',async event=>{
    event.preventDefault();const button=$('button',form);button.disabled=true;
    try{await api('settings','PUT',Object.fromEntries(new FormData(form)));toast('저장했어요.');}catch(error){toast(error.message);}finally{button.disabled=false;}
  });
}

/* ───── 처리 기록 ───── */
async function viewLog(){
  const d=await api('log');
  main.innerHTML=`<h1>처리 기록</h1><p class="ad-sub">운영자가 한 작업이 최근 100건까지 남아요.</p>${d.log.length?`<ul class="ad-log">${d.log.map(l=>`<li><time>${fmtTime(l.created)}</time><div><b>${esc(actionNames[l.action]||l.action)}</b> · ${esc(kindNames[l.target_kind]||l.target_kind)} <span class="meta" style="display:inline;color:var(--faint)">${esc(l.target_id)}</span> · ${esc(l.admin_name||'운영자')}${l.note?`<span class="note">${esc(l.note)}</span>`:''}</div></li>`).join('')}</ul>`:empty('아직 처리 기록이 없어요.')}`;
}

/* ───── Routing ───── */
const views={overview:viewOverview,projects:viewProjects,users:viewUsers,content:viewContent,reports:viewReports,settings:viewSettings,log:viewLog};
const loaders={projects:loadProjects,users:loadUsers,content:loadContent,reports:loadReports};
let searchTimer;
function bindSearch(load){$('#ad-q')?.addEventListener('input',event=>{clearTimeout(searchTimer);searchTimer=setTimeout(async()=>{state.q=event.target.value.trim();try{await load();}catch(error){$('#ad-list').innerHTML=errorBox(error);}},250);});}
async function show(view){
  if(!views[view])view='overview';
  if(view!==state.view)state.q='';
  state.view=view;window.onresize=null;
  $$('.ad-nav [data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.toggleAttribute('aria-current',b.dataset.view===view);});
  if(location.hash.slice(1)!==view)history.replaceState(null,'','#'+view);
  try{await views[view]();}catch(error){main.innerHTML=errorBox(error);}
}
async function refresh(){try{loaders[state.view]?await loaders[state.view]():await views[state.view]();}catch(error){toast(error.message);}}
async function refreshReportCount(){try{const d=await api('reports');const n=d.reports.length;const el=$('#ad-report-count');el.textContent=n;el.hidden=!n;}catch{}}

document.addEventListener('click',event=>{
  const t=event.target.closest('button');if(!t)return;
  if(t.dataset.view){show(t.dataset.view);return;}
  if(t.dataset.go){show(t.dataset.go);return;}
  if(t.hasAttribute('data-reload')){show(state.view);return;}
  if(t.dataset.kind&&!t.dataset.content){state.contentKind=t.dataset.kind;viewContent();return;}
  if(t.dataset.status){state.contentStatus=t.dataset.status;viewContent();return;}
  if(t.dataset.reportStatus){state.reportStatus=t.dataset.reportStatus;viewReports();return;}
  if(t.dataset.move){act(t,{path:'projects/'+encodeURIComponent(t.dataset.move),payload:{action:'move',offset:Number(t.dataset.offset)},done:'순서를 바꿨어요.'});return;}
  if(t.dataset.project){const a=t.dataset.action;act(t,{path:'projects/'+encodeURIComponent(t.dataset.project),payload:{action:a},done:{hide:'작품을 숨겼어요.',show:'작품을 다시 공개했어요.',pin:'주목 작품으로 고정했어요.',unpin:'주목 작품에서 뺐어요.'}[a],confirm:a==='hide'?{title:`‘${t.dataset.title}’ 작품을 숨길까요?`,copy:'사이트에서 바로 사라져요. 나중에 다시 공개할 수 있어요.',ok:'숨기기',danger:true}:null});return;}
  if(t.dataset.user){const a=t.dataset.action,name=t.dataset.name;const copy={suspend:['정지할까요?','즉시 로그아웃되고, 해제할 때까지 로그인할 수 없어요.','정지',true],unsuspend:['정지를 해제할까요?','다시 로그인하고 활동할 수 있어요.','해제',false],'make-admin':['운영자로 지정할까요?','이 대시보드에 들어와 모든 운영 작업을 할 수 있게 돼요.','지정',false],'make-member':['운영자에서 해제할까요?','일반 회원으로 바뀌어요.','해제',true]}[a];act(t,{path:'users/'+encodeURIComponent(t.dataset.user),payload:{action:a},done:'처리했어요.',confirm:{title:`‘${name}’ 님을 ${copy[0]}`,copy:copy[1],ok:copy[2],danger:copy[3]}});return;}
  if(t.dataset.content){const a=t.dataset.action;act(t,{path:`content/${t.dataset.kind}s/${encodeURIComponent(t.dataset.content)}`,payload:{action:a},done:a==='hide'?'숨겼어요.':'다시 공개했어요.',confirm:a==='hide'?{title:'이 콘텐츠를 숨길까요?',copy:'작성자를 포함해 누구에게도 보이지 않게 돼요.',ok:'숨기기',danger:true}:null});return;}
  if(t.dataset.report){const a=t.dataset.action;act(t,{path:'reports/'+encodeURIComponent(t.dataset.report),payload:{action:a},done:a==='hide'?'콘텐츠를 숨기고 신고를 처리했어요.':'신고를 기각했어요.',confirm:a==='hide'?{title:'신고된 콘텐츠를 숨길까요?',copy:'대상을 숨기고 신고를 처리 완료로 바꿔요.',ok:'숨기기',danger:true}:null});}
});
window.addEventListener('hashchange',()=>{const v=location.hash.slice(1);if(v!==state.view)show(v);});

(async function init(){
  let user=null;
  try{const response=await fetch('/api/session');user=(await response.json()).user;}catch{}
  if(!user||!user.isAdmin){
    if(user){$('#ad-gate-title').textContent='운영자 권한이 없는 계정이에요.';$('#ad-gate-copy').textContent=`${user.name} 님으로 로그인되어 있어요. 운영자 계정으로 다시 로그인해주세요.`;$('#ad-gate .ad-btn').textContent='사이트로 돌아가기';}
    $('#ad-gate').hidden=false;return;
  }
  $('#ad-user').textContent=`${user.name} 님`;$('#ad-shell').hidden=false;
  refreshReportCount();show(location.hash.slice(1)||'overview');
})();
