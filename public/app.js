'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const searchIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" stroke-width="1.6"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const typeNames = {website:'웹사이트',game:'게임',app:'앱'};
$('#search-toggle').innerHTML = searchIcon;
$('#search-symbol').innerHTML = searchIcon;
let projects = [];
let user = null;
let filter = 'all';
let query = '';
let sort = 'curated';
let currentFeatured = 'koiworld';
let detailId = null;
let toastTimeout;
let submitting = false;
let editingProjectId = null;
let saved;
try {const value=JSON.parse(localStorage.getItem('vibeflix.saved.v2') || '[]');saved=new Set(Array.isArray(value)?value.filter(id=>typeof id==='string'):[]);} catch {saved=new Set();}
function validUrl(value) {try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
function imageUrl(value) {return typeof value==='string'&&value.startsWith('/assets/')&&!value.includes('..')?value:validUrl(value);}
function toast(message) {clearTimeout(toastTimeout);$('#toast').textContent=message;$('#toast').classList.add('visible');toastTimeout=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
const findProject = id => projects.find(p=>p.id===id);

function artMarkup(p) {
  const art=['koiworld','dayflow','fishing','learnhub','deepchoi','godoftop','voyage'].includes(p.art)?p.art:'custom';
  let content;
  if(art==='koiworld')content='<img class="cover-image" src="/assets/koiworld-cover.png" alt="코이월드 — 교배하고, 수집하고, 힐링하세요" loading="lazy">';
  else if(art==='dayflow')content='<span class="service-art-title">Dayflow<span>MAKE ROOM FOR YOUR DAY.</span></span><div class="screen-frame"><img src="/assets/dayflow-screen.jpg" alt="Dayflow 일정 화면" loading="lazy"></div>';
  else if(art==='fishing')content='<img class="cover-image" src="/assets/fishing-lake.jpg" alt="네모낚시 버들못 게임 화면" loading="lazy"><span class="service-art-title">네모낚시<span>A LITTLE ESCAPE BY THE WATER.</span></span>';
  else if(art==='learnhub')content='<span class="service-art-title">LearnHub<span>FOLLOW YOUR CURIOSITY.</span></span><div class="screen-frame"><img src="/assets/learnhub-screen.jpg" alt="LearnHub 학습 화면" loading="lazy"></div>';
  else if(art==='deepchoi')content='<img class="cover-image" src="/assets/deepchoi-cover.png" alt="Deepchoi 포트폴리오의 우주 배경" loading="lazy"><span class="service-art-title">deepchoi<span>DESIGN. BUILD. EXPLORE.</span></span>';
  else if(art==='godoftop')content='<div class="tower-visual"><i></i><i></i><i></i><i></i></div><span class="service-art-title">GOD OF TOP<span>탑의 정점</span></span>';
  else if(art==='voyage')content='<img class="cover-image" src="/assets/mountain.jpg" alt="VOYAGE 여행 콘셉트를 위한 산 풍경" loading="lazy"><span class="service-art-title">VOYAGE<span>A WORLD WORTH WANDERING.</span></span><span class="concept-label">콘셉트 이미지</span>';
  else content=`<span class="custom-word">${escapeHtml(p.title)}</span>${imageUrl(p.image)?`<img class="cover-image" src="${escapeHtml(imageUrl(p.image))}" alt="${escapeHtml(p.title)} 커버" loading="lazy" referrerpolicy="no-referrer">`:''}`;
  return `<div class="card-art"><div class="art-main art-${art}">${content}</div></div>`;
}
function cardMarkup(p) {
  const isSaved=saved.has(p.id);
  return `<article class="project-card"><button class="card-open" data-detail="${escapeHtml(p.id)}" aria-label="${escapeHtml(p.title)} 자세히 보기">${artMarkup(p)}<div class="card-info"><div class="card-title-line"><span class="card-title">${escapeHtml(p.title)}</span><span class="card-category">${typeNames[p.type]}</span></div><div class="card-subtitle">${escapeHtml(p.subtitle)}</div><div class="card-metrics"><span class="card-rating">★ ${p.ratingCount?Number(p.rating).toFixed(1):'첫 평가를 기다려요'} <small>${p.ratingCount?'('+Number(p.ratingCount)+')':''}</small></span><span>♡ ${Number(p.recommendations||0)} <span class="metric-divider">·</span> 댓글 ${Number(p.commentCount||0)}</span></div><div class="card-bottom"><span class="creator-dot">${escapeHtml((p.creator||'V')[0].toUpperCase())}</span><span>${escapeHtml(p.creator)}</span><span class="card-availability ${p.status==='upcoming'?'upcoming':''}">${p.status==='upcoming'?'공개 준비 중':'● 지금 이용 가능'}</span></div></div></button>${p.badge?`<span class="card-top-tag ${p.featured?'lime':''}">${escapeHtml(p.badge)}</span>`:''}<button class="card-save ${isSaved?'saved':''}" data-save="${escapeHtml(p.id)}" aria-label="${escapeHtml(p.title)} ${isSaved?'찜 취소':'찜하기'}" aria-pressed="${isSaved}">${isSaved?'✓':'+'}</button></article>`;
}
function render() {
  let list=projects.filter(p=>(filter==='saved'?saved.has(p.id):(p.status!=='upcoming'||!!query)&&(filter==='all'||filter===p.type))&&`${p.title} ${p.subtitle} ${p.creator} ${p.description} ${(p.tags||[]).join(' ')}`.toLowerCase().includes(query));
  if(sort==='newest')list.sort((a,b)=>b.created-a.created);
  if(sort==='name')list.sort((a,b)=>a.title.localeCompare(b.title,'ko'));
  if(sort==='rating')list.sort((a,b)=>(b.rating||0)-(a.rating||0)||(b.ratingCount||0)-(a.ratingCount||0));
  if(sort==='popular')list.sort((a,b)=>(b.recommendations||0)-(a.recommendations||0));
  $('#project-row').innerHTML=list.map(cardMarkup).join('');
  $('#result-count').textContent=`${list.length}개의 작품`;
  $('#empty-state').hidden=list.length!==0;
  $('#empty-message').textContent=filter==='saved'&&!query?'마음에 드는 작품의 + 버튼을 눌러 나만의 컬렉션을 만들어보세요.':'다른 검색어나 카테고리로 새로운 작품을 찾아보세요.';
  const titles={all:'다음으로 빠져들 작품은?',website:'아이디어를 만나는 새로운 창.',game:'플레이 버튼 너머의 새로운 세계.',app:'일상에 작은 변화를 더하는 앱.',saved:'다시 만나고 싶은 작품들.'};
  $('#discovery-title').textContent=titles[filter];
  $('#row-title').innerHTML=query?`검색 결과 <span class="muted">${escapeHtml($('#search').value)}</span>`:filter==='saved'?'나만의 바이브 컬렉션':'<span class="trending-icon">↗</span> 지금, 주목할 바이브';
  $$('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter));});
  $$('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===filter));
  $('#saved-count').textContent=saved.size?saved.size:'';
  $('#fresh-section').hidden=filter!=='all'||!!query;
  $('#fresh-grid').innerHTML=projects.filter(p=>p.type!=='game'&&p.status!=='upcoming').slice(0,3).map(p=>`<button class="fresh-card" data-detail="${escapeHtml(p.id)}" aria-label="${escapeHtml(p.title)} 자세히 보기">${artMarkup(p)}<div class="fresh-text"><span class="fresh-label">${typeNames[p.type]} <span aria-hidden="true">/</span> ${escapeHtml(p.creator)}</span><h4>${escapeHtml(p.title)}</h4><p>${escapeHtml(p.subtitle)}</p><span class="fresh-cta">발견하기 ↗</span></div></button>`).join('');
  const upcoming=projects.filter(p=>p.status==='upcoming'&&(filter==='all'||filter===p.type)&&!query);
  $('#upcoming-section').hidden=!upcoming.length;
  $('#upcoming-grid').innerHTML=upcoming.map(cardMarkup).join('');
  updateHeroSave();requestAnimationFrame(updateArrows);
}
function setFilter(next,scroll=false){filter=next;render();$('#project-row').scrollLeft=0;if(scroll)$('#discover').scrollIntoView({behavior:'smooth'});}
async function toggleSave(id){
  if(!findProject(id))return;
  if(user){try{const response=await fetch('/api/community/bookmarks',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:id,active:!saved.has(id)})});if(!response.ok){const result=await response.json();throw Error(result.error);}}catch(error){toast(error.message||'찜 목록을 저장하지 못했어요.');return;}}
  if(saved.has(id)){saved.delete(id);toast('찜한 작품에서 삭제했어요.');}else{saved.add(id);toast('나만의 바이브 컬렉션에 추가했어요.');}
  if(!user)try{localStorage.setItem('vibeflix.saved.v2',JSON.stringify([...saved]));}catch{toast('브라우저 저장 공간이 없어 이번 방문에서만 유지됩니다.');}
  const position=$('#project-row').scrollLeft;render();$('#project-row').scrollLeft=position;
  if(detailId===id&&$('#detail-dialog').open){$('#detail-save').textContent=saved.has(id)?'✓ 찜했어요':'＋ 찜하기';$('#detail-save').setAttribute('aria-pressed',String(saved.has(id)));}
}
function updateHeroSave(){const state=saved.has(currentFeatured);$('#hero-save').classList.toggle('saved',state);$('#hero-save').textContent=state?'✓':'＋';$('#hero-save').setAttribute('aria-pressed',String(state));$('#hero-save').setAttribute('aria-label',`${findProject(currentFeatured)?.title||'작품'} ${state?'찜 취소':'찜하기'}`);}
function openDetail(id){
  const p=findProject(id);if(!p)return;detailId=id;
  const url=validUrl(p.url);
  $('#detail-content').innerHTML=`<div class="detail-cover">${artMarkup(p)}</div><div class="detail-body"><div class="detail-overline"><span class="type-label">${typeNames[p.type]}</span><span>${p.status==='upcoming'?'IN DEVELOPMENT':p.badge==='COMMUNITY'?'COMMUNITY PROJECT':'MADE BY DEEPCHOI'}</span></div><h2 id="detail-title">${escapeHtml(p.title)}</h2><p class="detail-subtitle">${escapeHtml(p.subtitle)}</p><p class="detail-description">${escapeHtml(p.description)}</p><div class="detail-creator"><span class="creator-dot">${escapeHtml((p.creator||'V')[0].toUpperCase())}</span>Created by ${escapeHtml(p.creator)}</div><div class="detail-tags">${(p.tags||[]).map(t=>`<span>#${escapeHtml(t)}</span>`).join('')}</div><div class="detail-actions">${url?`<a class="primary-button" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${p.type==='game'?'▶ 지금 플레이':'서비스 바로가기 ↗'}</a>`:'<button class="primary-button" disabled>공개 준비 중</button>'}<button class="secondary-button" id="detail-save" aria-pressed="${saved.has(id)}">${saved.has(id)?'✓ 찜했어요':'＋ 찜하기'}</button></div><p class="detail-notice">${url?'실제 서비스가 새 탭에서 열립니다. 서비스별로 별도 로그인이 필요할 수 있어요.':'아직 공개 플레이 링크가 준비되지 않았습니다. 정식 공개를 기다려주세요.'}</p>${p.owned?'<button class="remove-project" id="remove-project">내 작품을 공개 목록에서 내리기</button>':''}</div>`;
  $('#detail-dialog').setAttribute('aria-labelledby','detail-title');$('#detail-save').addEventListener('click',()=>toggleSave(id));
  $('#remove-project')?.addEventListener('click',async event=>{event.target.disabled=true;try{const response=await fetch(`/api/projects/${encodeURIComponent(id)}`,{method:'DELETE'});const result=await response.json();if(!response.ok)throw Error(result.error);projects=projects.filter(item=>item.id!==id);$('#detail-dialog').close();render();toast('공개 목록에서 작품을 내렸어요.');}catch(error){event.target.disabled=false;toast(error.message||'잠시 후 다시 시도해주세요.');}});
  $('#detail-dialog').showModal();
  const community=document.createElement('section');community.id='project-community';community.className='project-community';community.innerHTML='<p class="loading-copy">평가와 이야기를 불러오는 중…</p>';$('#detail-content').append(community);
  window.VibeCommunity?.attachProject(p);
}
function updateArrows(){const row=$('#project-row');$('#row-prev').disabled=row.scrollLeft<5;$('#row-next').disabled=row.scrollLeft+row.clientWidth>=row.scrollWidth-5;}
$$('[data-filter]').forEach(b=>b.addEventListener('click',()=>setFilter(b.dataset.filter)));
$$('[data-nav]').forEach(b=>b.addEventListener('click',()=>setFilter(b.dataset.nav,true)));
$('#sort').addEventListener('change',event=>{sort=event.target.value;render();});
$('#project-row').addEventListener('scroll',updateArrows,{passive:true});window.addEventListener('resize',updateArrows);
$('#row-prev').addEventListener('click',()=>$('#project-row').scrollBy({left:-$('#project-row').clientWidth*.8,behavior:'smooth'}));
$('#row-next').addEventListener('click',()=>$('#project-row').scrollBy({left:$('#project-row').clientWidth*.8,behavior:'smooth'}));
document.addEventListener('click',event=>{const detail=event.target.closest('[data-detail]');const save=event.target.closest('[data-save]');if(save)toggleSave(save.dataset.save);else if(detail)openDetail(detail.dataset.detail);});
document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement)event.target.remove();},true);
function openSearch(){$('#search-wrap').hidden=false;$('#discover').scrollIntoView({behavior:'smooth'});$('#search').focus({preventScroll:true});$('#search-toggle').setAttribute('aria-expanded','true');}
$('#search-toggle').setAttribute('aria-expanded','false');$('#search-toggle').addEventListener('click',openSearch);
$('#search').addEventListener('input',event=>{query=event.target.value.trim().toLowerCase();render();});
$('#search-close').addEventListener('click',()=>{$('#search-wrap').hidden=true;$('#search').value='';query='';render();$('#search-toggle').setAttribute('aria-expanded','false');$('#search-toggle').focus();});
$('#reset-filters').addEventListener('click',()=>{$('#search').value='';query='';setFilter('all');});
$('#profile-button').addEventListener('click',()=>window.VibeCommunity?.openProfile());$('#hero-info').addEventListener('click',()=>openDetail(currentFeatured));$('#hero-save').addEventListener('click',()=>toggleSave(currentFeatured));
const featured=[
  {id:'koiworld',title:'코이월드',sub:'KOIWORLD — YOUR LITTLE POND',kicker:'바쁜 하루 끝, 나만의 연못으로',description:'어떤 무늬의 코이가 태어날까요?<br>키우고, 교배하고, 수집하는 나만의 작은 힐링.',genre:'힐링 · 수집 · 육성',bg:'koi',image:'/assets/koi-icon.png',url:'https://koigarden.shop/'},
  {id:'fishing',title:'네모낚시',sub:'CAST A LINE. TAKE A BREATH.',kicker:'오늘은, 잠깐 물가에 앉아볼까요',description:'블록으로 만든 저수지에서 즐기는 좌대 낚시.<br>채비를 고르고, 찌를 바라보고, 대물을 만나보세요.',genre:'3D 복셀 · 낚시 시뮬레이션',bg:'fishing',image:'/assets/fishing-lake.jpg',url:'https://voxel-fishing-choi.web.app/'},
  {id:'dayflow',title:'Dayflow',sub:'A LITTLE MORE FLOW IN YOUR DAY',kicker:'흩어진 하루가, 하나의 흐름으로',description:'일정, 할 일, 메모, 그리고 AI와의 대화.<br>복잡한 하루를 나만의 속도로 정리하는 공간.',genre:'AI · 일정 · 생산성',bg:'dayflow',image:'/assets/dayflow-screen.jpg',url:'https://dayflow.web.app/'}
];
$$('[data-slide]').forEach(button=>button.addEventListener('click',()=>{
  const index=Number(button.dataset.slide);const f=featured[index];currentFeatured=f.id;
  $('.hero h1').innerHTML=`${f.title}<span>${f.sub}</span>`;$('.hero-kicker').textContent=f.kicker;$('.hero-description').innerHTML=f.description;
  $('.hero-meta').innerHTML=`<span class="type-label">${f.id==='dayflow'?'앱':'게임'}</span><span>${f.genre}</span><span class="meta-dot">·</span><span>by deepchoi</span><span class="live-label">지금 이용 가능</span>`;
  $('.hero').dataset.feature=f.bg;$('#hero-art-image').src=f.image;$('#hero-play').href=f.url;$('#hero-play').innerHTML=f.id==='dayflow'?'서비스 바로가기 ↗':'<span class="play-icon">▶</span> 지금 플레이';$('.hero-side>span').innerHTML=`0${index+1} <i>/ 03</i>`;
  $$('[data-slide]').forEach((b,i)=>{b.classList.toggle('selected',i===index);b.setAttribute('aria-pressed',String(i===index));});updateHeroSave();
}));
async function loadSession(){
  try{const response=await fetch('/api/session');if(!response.ok)throw Error('로그인 확인 실패');const data=await response.json();user=data.user;}catch{user=null;}
  $('#sign-in').hidden=!!user;$('#profile-button').hidden=!user;$('#sign-out').hidden=!user;
  if(user){$('#profile-button').textContent=user.name[0].toUpperCase();$('#profile-button').title=`${user.name} · 찜한 작품`;}
  document.dispatchEvent(new CustomEvent('vibe:auth',{detail:user}));
}
const sessionReady=loadSession();
async function openUpload(editId){await sessionReady;editingProjectId=typeof editId==='string'?editId:null;const p=editingProjectId?findProject(editingProjectId):null;const form=$('#upload-form');if(p){for(const key of ['title','creator','type','url','description','image'])form.elements.namedItem(key).value=p[key]||'';}else if(form.dataset.editing){form.reset();}form.dataset.editing=editingProjectId||'';if(user){form.elements.namedItem('creator').value=user.name;form.elements.namedItem('creator').readOnly=true;}$('#upload-dialog h2').textContent=p?'작품 소개를 다듬어주세요.':'당신의 작품을 소개해주세요.';$('#upload-form').hidden=!user;$('#upload-auth').hidden=!!user;$('#form-error').hidden=true;if(!$('#upload-dialog').open)$('#upload-dialog').showModal();}
$('#upload-open').addEventListener('click',openUpload);$('#banner-upload').addEventListener('click',openUpload);
$('#upload-form').addEventListener('submit',async event=>{
  event.preventDefault();if(submitting)return;const form=event.target;const data=new FormData(form);const payload=Object.fromEntries(data);$('#form-error').hidden=true;
  for(const name of ['title','creator','description']){const field=form.elements.namedItem(name);if(!String(data.get(name)).trim()){field.setCustomValidity('공백 이외의 내용을 입력해주세요.');field.reportValidity();field.addEventListener('input',()=>field.setCustomValidity(''),{once:true});return;}}
  submitting=true;const button=$('button[type="submit"]',form);button.disabled=true;button.textContent='작품을 등록하는 중…';
  try{
    const response=await fetch(editingProjectId?`/api/projects/${encodeURIComponent(editingProjectId)}`:'/api/projects',{method:editingProjectId?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();
    if(!response.ok){if(response.status===401){user=null;$('#upload-form').hidden=true;$('#upload-auth').hidden=false;}throw Error(result.error||'등록에 실패했어요. 잠시 후 다시 시도해주세요.');}
    const edited=!!editingProjectId;editingProjectId=null;form.reset();delete form.dataset.editing;$('#upload-dialog').close();query='';$('#search').value='';sort='newest';$('#sort').value='newest';await loadCatalog();setFilter('all',true);toast(edited?'작품 소개를 수정했어요.':'작품이 공개되었어요. 이제 다른 방문자도 볼 수 있어요.');
  }catch(error){$('#form-error').textContent=error.message||'네트워크 연결을 확인하고 다시 시도해주세요.';$('#form-error').hidden=false;}
  finally{submitting=false;button.disabled=false;button.innerHTML='공개 등록하기 <span>↗</span>';}
});
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$$('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
$('#about-button').addEventListener('click',()=>$('#about-dialog').showModal());
document.addEventListener('keydown',event=>{if(event.key==='/'&&!$('dialog[open]')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){event.preventDefault();openSearch();}});
async function loadCatalog(){
  let message='';
  try{const response=await fetch('/api/projects');const result=await response.json();if(!Array.isArray(result.projects))throw Error('잘못된 응답');projects=result.projects;message=result.error||'';}
  catch{try{const response=await fetch('/catalog.json');if(!response.ok)throw Error();projects=await response.json();message='커뮤니티 작품을 불러오지 못했습니다. 기본 서비스는 계속 이용할 수 있어요.';}catch{message='작품을 불러올 수 없습니다. 연결을 확인한 뒤 새로고침해주세요.';}}
  $('#catalog-status').hidden=!message;$('#catalog-status').textContent=message;render();
  document.dispatchEvent(new CustomEvent('vibe:catalog'));
}
loadCatalog();
if(new URL(location.href).searchParams.get('upload')==='1')openUpload();
window.Vibe={getUser:()=>user,getProjects:()=>projects,getSaved:()=>[...saved],setSaved:ids=>{saved=new Set(ids);render();},refreshAuth:loadSession,reload:loadCatalog,openDetail,openUpload,render,artMarkup,toast,escapeHtml,setFilter,patchProject:(id,patch)=>{const p=findProject(id);if(p)Object.assign(p,patch);render();}};
