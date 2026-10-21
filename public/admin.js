'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const typeNames={website:'웹사이트',game:'게임',app:'앱',art:'그림·만화',video:'영상',novel:'소설'};
const postLabels={general:'자유 이야기',showcase:'작품 소개',buildlog:'개발 일지',question:'질문',feedback:'피드백',project:'작품 댓글',post:'게시글 댓글'};
const kindNames={post:'게시글',comment:'댓글',project:'작품',user:'회원',site:'사이트'};
const actionNames={'project.hide':'작품 숨김','project.show':'작품 다시 공개','project.pin':'주목 작품 고정','project.unpin':'주목 작품 해제','project.move':'주목 순서 변경','user.suspend':'회원 정지','user.unsuspend':'회원 정지 해제','user.make-admin':'운영자 지정','user.make-member':'운영자 해제','post.hide':'게시글 숨김','post.show':'게시글 다시 공개','comment.hide':'댓글 숨김','comment.show':'댓글 다시 공개','report.hide':'신고 처리 (콘텐츠 숨김)','report.dismiss':'신고 기각','settings':'사이트 설정 변경','project.edit':'작품 수정','project.restore-design':'기본 디자인 복원','project.delete':'작품 영구 삭제','post.delete':'게시글 영구 삭제','comment.delete':'댓글 영구 삭제','user.delete':'회원 영구 삭제','banner.create':'배너 추가','banner.edit':'배너 수정','banner.delete':'배너 삭제','banner.move':'배너 순서 변경','banner.enable':'배너 켜기','banner.disable':'배너 끄기','samples.delete':'예시 콘텐츠 모두 삭제'};
kindNames.banner='배너';
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
// requireText: permanent actions only enable once the operator types the exact name
function confirmAction({title,copy,ok='확인',danger=false,requireText=''}){
  const d=$('#ad-confirm');$('#ad-confirm-title').textContent=title;$('#ad-confirm-copy').textContent=copy;$('#ad-confirm-note').value='';
  const okButton=$('#ad-confirm-ok');okButton.textContent=ok;okButton.className=`ad-btn ${danger?'danger':'primary'}`;
  const typed=$('#ad-confirm-type');$('#ad-confirm-type-wrap').hidden=!requireText;typed.value='';
  $('#ad-confirm-type-label').textContent=`확인을 위해 ‘${requireText}’을(를) 그대로 입력하세요`;
  okButton.disabled=!!requireText;typed.oninput=()=>{okButton.disabled=typed.value.trim()!==requireText.trim();};
  d.returnValue='';d.showModal();if(requireText)typed.focus();
  return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='ok'?{note:$('#ad-confirm-note').value.trim(),typed:typed.value.trim()}:null),{once:true}));
}
const badge=(label,kind='')=>`<span class="ad-badge ${kind}">${esc(label)}</span>`;
const empty=(copy)=>`<div class="ad-empty">${esc(copy)}</div>`;
const table=(head,rows)=>rows.length?`<div class="ad-table-wrap"><table class="ad-table"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`:'';
const errorBox=error=>`<div class="ad-empty">${esc(error.message)} <button class="ad-btn" data-reload>다시 불러오기</button></div>`;

// Runs an action button: optional confirm (with note), API call, toast, refresh.
async function act(button,{path,payload={},confirm,done,method='PATCH'}){
  let note='',typed='';
  if(confirm){const answer=await confirmAction(confirm);if(!answer)return;({note,typed}=answer);}
  button.disabled=true;
  try{await api(path,method,{...payload,note,...(typed?{confirm:typed}:{})});toast(done);await refresh();refreshReportCount();}
  catch(error){toast(error.message);button.disabled=false;}
}
const deleteConfirm=(name,what)=>({title:`‘${name}’ ${what}을(를) 영구 삭제할까요?`,copy:'되돌릴 수 없어요. 연결된 댓글·추천·별점·신고도 함께 지워져요. 일시적으로 감추려면 ‘숨기기’를 쓰세요.',ok:'영구 삭제',danger:true,requireText:name});

/* ───── Edit dialog + image preparation ───── */
let editSubmit=null;
function openEditor({title,body,save,extra=''}){
  $('#ad-edit-title').textContent=title;$('#ad-edit-body').innerHTML=body;$('#ad-edit-extra').innerHTML=extra;$('#ad-edit-error').hidden=true;
  editSubmit=save;$('#ad-edit').showModal();$('#ad-edit-body input,#ad-edit-body textarea')?.focus();
}
$('#ad-edit-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('#ad-edit-save');button.disabled=true;$('#ad-edit-error').hidden=true;
  try{await editSubmit(new FormData(event.target));$('#ad-edit').close();await refresh();}
  catch(error){$('#ad-edit-error').textContent=error.message;$('#ad-edit-error').hidden=false;}
  finally{button.disabled=false;}
});
$('[data-edit-cancel]').addEventListener('click',()=>$('#ad-edit').close());
const field=(label,input,hint='')=>`<label class="ad-field">${label}${hint?` <small>${hint}</small>`:''}${input}</label>`;
const options=(list,value)=>list.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(l)}</option>`).join('');
function loadImage(file){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{URL.revokeObjectURL(img.src);resolve(img);};img.onerror=()=>reject(Error('이미지를 읽을 수 없어요.'));img.src=URL.createObjectURL(file);});}
// Encode under a byte budget: WebP when the browser supports it, otherwise JPEG; quality steps down until it fits.
function encode(canvas,maxBytes){
  const webp=canvas.toDataURL('image/webp',.9).startsWith('data:image/webp');
  for(const q of [.9,.84,.78,.7,.62,.54,.46]){const url=canvas.toDataURL(webp?'image/webp':'image/jpeg',q);if(url.length*.75<=maxBytes)return url;}
  throw Error('이미지가 너무 복잡해서 용량을 줄이지 못했어요. 다른 이미지를 골라주세요.');
}
/** Thumbnail: center-crop to 16:9 and scale to exactly 1280×720 (the site's cover rule). */
async function prepareCover(file){const img=await loadImage(file);const c=document.createElement('canvas');c.width=1280;c.height=720;const r=Math.max(1280/img.width,720/img.height),w=1280/r,h=720/r;c.getContext('2d').drawImage(img,(img.width-w)/2,(img.height-h)/2,w,h,0,0,1280,720);return encode(c,780*1024);}
/** Banner image: keep its shape, at most 1920px wide. */
async function prepareBanner(file){const img=await loadImage(file);const s=Math.min(1,1920/img.width,1920/img.height);const c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return encode(c,680*1024);}
// One image picker inside the edit dialog; value '' = remove, data URL = replace, undefined = keep.
let pickedImage;
function imagePicker({current,ratio,prepare,removable=true,hint}){
  pickedImage=undefined;
  setTimeout(()=>{
    const input=$('#ad-image-file'),preview=$('#ad-image-preview');
    input.addEventListener('change',async()=>{const file=input.files[0];if(!file)return;try{preview.classList.add('busy');pickedImage=await prepare(file);preview.style.backgroundImage=`url("${pickedImage}")`;preview.classList.remove('empty');}catch(error){toast(error.message);}finally{preview.classList.remove('busy');input.value='';}});
    $('#ad-image-clear')?.addEventListener('click',()=>{pickedImage='';preview.style.backgroundImage='';preview.classList.add('empty');});
  });
  return `<div class="ad-field"><span>이미지 <small>${hint}</small></span><div class="ad-image"><div class="ad-image-preview ${current?'':'empty'}" id="ad-image-preview" style="aspect-ratio:${ratio};${current?`background-image:url('${esc(current)}')`:''}"><span>이미지 없음</span></div><div class="ad-image-actions"><label class="ad-btn">이미지 고르기<input type="file" id="ad-image-file" accept="image/png,image/jpeg,image/webp" hidden></label>${removable?'<button type="button" class="ad-btn" id="ad-image-clear">없애기</button>':''}</div></div></div>`;
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
  const d=await api('projects?q='+encodeURIComponent(state.q));const byId=new Map(d.projects.map(p=>[p.id,p]));state.projects=byId;state.genres=d.genres||{};
  const pinned=d.pinned.map(id=>byId.get(id)||{id,title:id,missing:true});
  $('#ad-pinned').innerHTML=pinned.length&&!state.q?`<section class="ad-section" style="margin-top:0;margin-bottom:24px"><h2>주목 작품 순서</h2>${table(['순서','작품',''],pinned.map((p,i)=>`<tr><td class="num">${i+1}</td><td><span class="title">${esc(p.title)}</span>${p.hidden?` ${badge('숨김 상태','off')}`:''}</td><td><div class="ad-actions"><button class="ad-btn icon" data-move="${esc(p.id)}" data-offset="-1" aria-label="위로" ${i===0?'disabled':''}>↑</button><button class="ad-btn icon" data-move="${esc(p.id)}" data-offset="1" aria-label="아래로" ${i===pinned.length-1?'disabled':''}>↓</button><button class="ad-btn" data-project="${esc(p.id)}" data-action="unpin">해제</button></div></td></tr>`))}</section>`:'';
  $('#ad-list').innerHTML=table(['작품','카테고리','출처','등록일','상태',''],d.projects.map(p=>`<tr>
    <td><span class="title">${esc(p.title)}</span><span class="meta">${esc(p.creator)}${p.url?` · <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.url.replace(/^https?:\/\//,'').slice(0,40))} ↗</a>`:''}</span></td>
    <td>${esc(typeNames[p.type]||p.type)}</td>
    <td>${p.source==='catalog'?badge('기본 작품','plain'):p.source==='sample'?badge('예시','plain'):badge(`커뮤니티 · ${p.ownerName||'알 수 없음'}`,'plain')}</td>
    <td class="num">${p.source==='catalog'?'-':fmtDate(p.created)}</td>
    <td>${p.hidden?badge('숨김','off'):p.status==='upcoming'?badge('공개 예정'):p.sample?badge('예시로 공개'):badge('공개','ok')} ${p.pinned>=0?badge(`주목 ${p.pinned+1}`,'pin'):''}</td>
    <td><div class="ad-actions"><button class="ad-btn" data-edit-project="${esc(p.id)}">수정</button>${p.pinned>=0?`<button class="ad-btn" data-project="${esc(p.id)}" data-action="unpin">주목 해제</button>`:`<button class="ad-btn" data-project="${esc(p.id)}" data-action="pin" ${p.hidden?'disabled':''}>주목 고정</button>`}${p.hidden?`<button class="ad-btn" data-project="${esc(p.id)}" data-action="show">다시 공개</button>`:`<button class="ad-btn danger" data-project="${esc(p.id)}" data-action="hide" data-title="${esc(p.title)}">숨기기</button>`}</div></td></tr>`))||empty(state.q?'검색 결과가 없어요.':'작품이 없어요.');
}

function editProject(id){
  const p=state.projects?.get(id);if(!p)return;
  const body=`<div class="ad-form-grid">
    ${field('작품 이름',`<input name="title" maxlength="60" required value="${esc(p.title)}">`)}
    ${field('크리에이터',`<input name="creator" maxlength="40" required value="${esc(p.creator)}">`)}
    ${field('카테고리',`<select name="type">${options(Object.entries(typeNames),p.type)}</select>`)}
    ${field('상태',`<select name="status">${options([['live','공개'],['upcoming','공개 예정'],...(p.source==='sample'?[['sample','예시']]:[])],p.status)}</select>`)}
  </div>
  ${field('작품 링크',`<input name="url" maxlength="2000" value="${esc(p.url)}" placeholder="https://">`,'공개 예정이면 비워둘 수 있어요')}
  ${field('한 줄 소개',`<input name="subtitle" maxlength="120" value="${esc(p.subtitleRaw)}" placeholder="비우면 작품 소개 앞부분이 보여요">`,'카드에 보이는 문구')}
  ${field('작품 소개',`<textarea name="description" maxlength="1000" rows="5" required>${esc(p.description)}</textarea>`)}
  <div class="ad-field"><span>장르 <small>최대 3개 · 카테고리 페이지에서 이 장르 줄에 나와요</small></span><div class="ad-chips" id="ad-genres"></div></div>
  ${field('태그',`<input name="tags" value="${esc((p.tags||[]).filter(t=>t!=='커뮤니티').join(', '))}" placeholder="쉼표로 구분, 최대 6개">`)}
  ${imagePicker({current:p.image,ratio:'16/9',prepare:prepareCover,hint:'아무 이미지나 고르면 16:9로 잘라 1280×720으로 맞춰요'+(p.art!=='custom'?' · 바꾸면 기본 카드 디자인 대신 이 이미지가 보여요':'')})}`;
  const extra=`<button type="button" class="ad-btn danger" data-delete-project="${esc(p.id)}">영구 삭제</button>${p.canRestoreDesign?`<button type="button" class="ad-btn" data-project="${esc(p.id)}" data-action="restore-design">기본 디자인으로</button>`:''}`;
  openEditor({title:`작품 수정 · ${p.title}`,body,extra,save:async form=>{
    const payload={action:'edit',...Object.fromEntries(form),tags:String(form.get('tags')||'').split(',').map(t=>t.trim()).filter(Boolean),genres:[...picked]};
    if(pickedImage!==undefined)payload.image=pickedImage;
    await api('projects/'+encodeURIComponent(id),'PATCH',payload);toast('작품을 수정했어요.');
  }});
  // genre chips follow the category select
  const picked=new Set(p.genres||[]);const box=$('#ad-genres'),typeSelect=$('#ad-edit-form').type;
  const drawGenres=()=>{const list=state.genres[typeSelect.value]||[];for(const g of picked)if(!list.includes(g))picked.delete(g);box.innerHTML=list.map(g=>`<button type="button" class="ad-chip${picked.has(g)?' on':''}" data-genre="${esc(g)}" aria-pressed="${picked.has(g)}">${esc(g)}</button>`).join('')||'<span class="meta">이 카테고리에는 장르가 없어요.</span>';};
  box.addEventListener('click',event=>{const chip=event.target.closest('[data-genre]');if(!chip)return;const g=chip.dataset.genre;if(picked.has(g))picked.delete(g);else if(picked.size>=3){toast('장르는 3개까지 고를 수 있어요.');return;}else picked.add(g);drawGenres();});
  typeSelect.addEventListener('change',drawGenres);drawGenres();
}

/* ───── 배너 ───── */
const themeNames={koi:'코이월드 테마 (청록 배경 + 오른쪽 이미지)',fishing:'네모낚시 테마 (호수 사진 배경)',dayflow:'Dayflow 테마 (파란 배경 + 오른쪽 화면)',cover:'작품 썸네일 카드 (흐린 배경 + 오른쪽 카드 · 이미지 없으면 연결 작품 썸네일)',custom:'직접 꾸미기 (올린 이미지를 배경 전체에)'};
async function viewBanners(){
  main.innerHTML=`<h1>배너</h1><p class="ad-sub">홈 맨 위 큰 배너예요. 켜진 배너가 순서대로 넘어가요. 최대 10개까지 만들 수 있어요.</p>
  <div class="ad-toolbar"><button class="ad-btn primary" data-new-banner>＋ 새 배너</button></div><div id="ad-list"></div>`;
  try{const d=await api('projects');state.projects=new Map(d.projects.map(p=>[p.id,p]));}catch{}
  await loadBanners();
}
async function loadBanners(){
  const d=await api('banners');state.banners=new Map(d.banners.map(b=>[b.id,b]));
  $('#ad-list').innerHTML=table(['순서','배너','연결 작품','디자인','상태',''],d.banners.map((b,i)=>`<tr>
    <td><div class="ad-actions" style="justify-content:flex-start"><button class="ad-btn icon" data-banner="${esc(b.id)}" data-action="move" data-offset="-1" aria-label="위로" ${i===0?'disabled':''}>↑</button><button class="ad-btn icon" data-banner="${esc(b.id)}" data-action="move" data-offset="1" aria-label="아래로" ${i===d.banners.length-1?'disabled':''}>↓</button></div></td>
    <td><div class="ad-banner-cell"><span class="ad-thumb" style="${b.image?`background-image:url('${esc(b.image)}')`:''}"></span><span><span class="title">${esc(b.title)}</span><span class="meta">${esc(b.description.split('\n')[0]||'')}</span></span></div></td>
    <td>${b.projectTitle?esc(b.projectTitle):'<span class="meta">없음</span>'}</td><td>${esc(themeNames[b.theme]?.split(' (')[0]||b.theme)}</td>
    <td>${b.enabled?badge('켜짐','ok'):badge('꺼짐','plain')}</td>
    <td><div class="ad-actions"><button class="ad-btn" data-edit-banner="${esc(b.id)}">수정</button>${b.enabled?`<button class="ad-btn" data-banner="${esc(b.id)}" data-action="disable">끄기</button>`:`<button class="ad-btn" data-banner="${esc(b.id)}" data-action="enable">켜기</button>`}<button class="ad-btn danger" data-delete-banner="${esc(b.id)}">삭제</button></div></td></tr>`))||empty('배너가 없어요. 새 배너를 만들어주세요.');
}
function editBanner(id){
  const b=id?state.banners.get(id):{title:'',description:'',buttonLabel:'바로가기',buttonIcon:'none',url:'',theme:'custom',image:'',projectId:''};
  const projectOptions=[['','연결하지 않음'],...[...(state.projects?.values()||[])].map(p=>[p.id,p.title])];
  const body=`${field('연결 작품',`<select name="projectId" id="ad-banner-project">${options(projectOptions,b.projectId)}</select>`,'‘자세히 보기’와 찜 버튼이 이 작품으로 연결돼요')}
  ${field('배너 제목',`<input name="title" maxlength="40" required value="${esc(b.title)}">`)}
  ${field('설명',`<textarea name="description" maxlength="200" rows="3">${esc(b.description)}</textarea>`,'세 줄까지 · 줄바꿈 그대로 보여요')}
  <div class="ad-form-grid">
    ${field('버튼 문구',`<input name="buttonLabel" maxlength="20" value="${esc(b.buttonLabel)}">`)}
    ${field('버튼 아이콘',`<select name="buttonIcon">${options([['none','없음'],['play','▶ 재생']],b.buttonIcon)}</select>`)}
  </div>
  ${field('버튼 링크',`<input name="url" maxlength="500" id="ad-banner-url" value="${esc(b.url)}" placeholder="https:// 또는 /로 시작">`,'비우면 버튼이 숨겨져요')}
  ${field('디자인',`<select name="theme">${options(Object.entries(themeNames),b.theme)}</select>`)}
  ${imagePicker({current:b.image,ratio:'2.9/1',prepare:prepareBanner,hint:'직접 꾸미기는 가로로 긴 사진(약 2.9:1)이 잘 어울려요 · 테마는 오른쪽에 띄울 이미지'})}`;
  openEditor({title:id?`배너 수정 · ${b.title}`:'새 배너',body,save:async form=>{
    const payload={...Object.fromEntries(form)};if(pickedImage!==undefined)payload.image=pickedImage;
    if(id)await api('banners/'+encodeURIComponent(id),'PATCH',{action:'edit',...payload});else await api('banners','POST',payload);
    toast(id?'배너를 수정했어요.':'배너를 만들었어요.');
  }});
  // picking a work pre-fills empty title and link
  $('#ad-banner-project').addEventListener('change',event=>{const p=state.projects?.get(event.target.value);if(!p)return;const form=$('#ad-edit-form');if(!form.title.value)form.title.value=p.title;if(!form.url.value&&p.url)form.url.value=p.url;});
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
    <td><div class="ad-actions">${u.self?'':`${u.role==='admin'?`<button class="ad-btn" data-user="${esc(u.id)}" data-action="make-member" data-name="${esc(u.name)}">운영자 해제</button>`:`<button class="ad-btn" data-user="${esc(u.id)}" data-action="make-admin" data-name="${esc(u.name)}">운영자 지정</button>`}${u.suspended?`<button class="ad-btn" data-user="${esc(u.id)}" data-action="unsuspend" data-name="${esc(u.name)}">정지 해제</button>`:`<button class="ad-btn danger" data-user="${esc(u.id)}" data-action="suspend" data-name="${esc(u.name)}" ${u.role==='admin'?'disabled title="운영자는 먼저 해제하세요"':''}>정지</button>`}<button class="ad-btn danger" data-delete-user="${esc(u.id)}" data-name="${esc(u.name)}" ${u.role==='admin'?'disabled title="운영자는 먼저 해제하세요"':''}>삭제</button>`}</div></td></tr>`))||empty(state.q?'검색 결과가 없어요.':'아직 회원이 없어요.');
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
    <td><div class="ad-actions">${c.hidden?`<button class="ad-btn" data-content="${esc(c.id)}" data-kind="${kind}" data-action="show">다시 공개</button>`:`<button class="ad-btn danger" data-content="${esc(c.id)}" data-kind="${kind}" data-action="hide">숨기기</button>`}<button class="ad-btn danger" data-delete-content="${esc(c.id)}" data-kind="${kind}">영구 삭제</button></div></td></tr>`))||empty('표시할 콘텐츠가 없어요.');
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
    <button class="ad-btn primary">이메일 저장</button></form>
  <div class="ad-card" id="ad-samples"><h2>예시 콘텐츠</h2><p>빈 카테고리를 채우려고 넣은 임시 작품·글·배너예요. 사이트에 ‘예시’로 표시돼요. 실제 콘텐츠가 충분히 모이면 한 번에 지울 수 있어요.</p><p id="ad-samples-count" class="ad-sub" style="margin:0 0 14px">불러오는 중…</p><button class="ad-btn danger" id="ad-samples-delete" disabled>예시 콘텐츠 모두 지우기</button></div>`;
  api('samples').then(c=>{const total=c.projects+c.posts+c.banners;$('#ad-samples-count').textContent=total?`작품 ${c.projects}개 · 게시글 ${c.posts}개 · 배너 ${c.banners}개`:'남아 있는 예시 콘텐츠가 없어요.';$('#ad-samples-delete').disabled=!total;}).catch(error=>{$('#ad-samples-count').textContent=error.message;});
  $('#ad-samples-delete').addEventListener('click',event=>act(event.currentTarget,{method:'DELETE',path:'samples',confirm:{title:'예시 콘텐츠를 모두 지울까요?',copy:'예시 작품·게시글·배너와 예시 계정이 영구 삭제돼요. 실제 회원 콘텐츠는 그대로예요.',ok:'모두 지우기',danger:true,requireText:'예시 삭제'},done:'예시 콘텐츠를 지웠어요.'}));
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
const views={overview:viewOverview,projects:viewProjects,banners:viewBanners,users:viewUsers,content:viewContent,reports:viewReports,settings:viewSettings,log:viewLog};
const loaders={projects:loadProjects,banners:loadBanners,users:loadUsers,content:loadContent,reports:loadReports};
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
  if(t.dataset.editProject){editProject(t.dataset.editProject);return;}
  if(t.dataset.deleteProject){const p=state.projects.get(t.dataset.deleteProject);$('#ad-edit').close();act(t,{method:'DELETE',path:'projects/'+encodeURIComponent(p.id),confirm:deleteConfirm(p.title,'작품'),done:'작품을 영구 삭제했어요.'});return;}
  if(t.hasAttribute('data-new-banner')){editBanner('');return;}
  if(t.dataset.editBanner){editBanner(t.dataset.editBanner);return;}
  if(t.dataset.deleteBanner){const b=state.banners.get(t.dataset.deleteBanner);act(t,{method:'DELETE',path:'banners/'+encodeURIComponent(b.id),confirm:{title:`‘${b.title}’ 배너를 삭제할까요?`,copy:'홈에서 바로 빠져요. 연결된 작품은 그대로 남아요.',ok:'삭제',danger:true},done:'배너를 삭제했어요.'});return;}
  if(t.dataset.banner){const a=t.dataset.action;act(t,{path:'banners/'+encodeURIComponent(t.dataset.banner),payload:{action:a,offset:Number(t.dataset.offset)},done:{move:'순서를 바꿨어요.',enable:'배너를 켰어요.',disable:'배너를 껐어요.'}[a]});return;}
  if(t.dataset.deleteUser){act(t,{method:'DELETE',path:'users/'+encodeURIComponent(t.dataset.deleteUser),confirm:{...deleteConfirm(t.dataset.name,'회원'),copy:'탈퇴 요청 처리용이에요. 이 회원의 작품·글·댓글·추천·별점·찜·알림이 모두 지워지고 되돌릴 수 없어요.'},done:'회원과 활동 기록을 삭제했어요.'});return;}
  if(t.dataset.deleteContent){const kind=t.dataset.kind;act(t,{method:'DELETE',path:`content/${kind}s/${encodeURIComponent(t.dataset.deleteContent)}`,confirm:{...deleteConfirm('삭제',kind==='post'?'게시글':'댓글'),title:`이 ${kind==='post'?'게시글':'댓글'}을 영구 삭제할까요?`},done:'영구 삭제했어요.'});return;}
  if(t.dataset.action==='restore-design'){$('#ad-edit').close();}
  if(t.dataset.go){show(t.dataset.go);return;}
  if(t.hasAttribute('data-reload')){show(state.view);return;}
  if(t.dataset.kind&&!t.dataset.content){state.contentKind=t.dataset.kind;viewContent();return;}
  if(t.dataset.status){state.contentStatus=t.dataset.status;viewContent();return;}
  if(t.dataset.reportStatus){state.reportStatus=t.dataset.reportStatus;viewReports();return;}
  if(t.dataset.move){act(t,{path:'projects/'+encodeURIComponent(t.dataset.move),payload:{action:'move',offset:Number(t.dataset.offset)},done:'순서를 바꿨어요.'});return;}
  if(t.dataset.project){const a=t.dataset.action;act(t,{path:'projects/'+encodeURIComponent(t.dataset.project),payload:{action:a},done:{hide:'작품을 숨겼어요.',show:'작품을 다시 공개했어요.',pin:'주목 작품으로 고정했어요.',unpin:'주목 작품에서 뺐어요.','restore-design':'기본 디자인으로 되돌렸어요.'}[a],confirm:a==='hide'?{title:`‘${t.dataset.title}’ 작품을 숨길까요?`,copy:'사이트에서 바로 사라져요. 나중에 다시 공개할 수 있어요.',ok:'숨기기',danger:true}:null});return;}
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
