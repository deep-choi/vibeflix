'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const searchIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" stroke-width="1.6"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const typeNames = {website:'웹사이트',game:'게임',app:'앱',art:'그림·만화',video:'영상',novel:'소설'};
const ctaLabels = {game:'▶ 지금 플레이',video:'▶ 영상 보기',novel:'읽으러 가기 ↗',art:'작품 보러가기 ↗'};
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
let homePosts = [];
let pinnedIds = [];
let genreMap = {}; // category → genre list, from /api/projects (public/genres.json)
const typeTaglines = {website:'아이디어를 만나는 새로운 창.',game:'플레이 버튼 너머의 새로운 세계.',app:'일상에 작은 변화를 더하는 앱.',art:'상상이 그림이 되는 순간.',video:'움직이는 상상, 영상.',novel:'한 줄에서 시작되는 이야기.'};
const pinRank = p => { const i = pinnedIds.indexOf(p.id); return i < 0 ? 1e9 : i; };
let saved;
try {const value=JSON.parse(localStorage.getItem('vibeflix.saved.v2') || '[]');saved=new Set(Array.isArray(value)?value.filter(id=>typeof id==='string'):[]);} catch {saved=new Set();}
function validUrl(value) {try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
function imageUrl(value) {return typeof value==='string'&&(value.startsWith('/assets/')||/^\/api\/projects\/[\w-]+\/cover(\?v=\d+)?$/.test(value)||/^\/api\/project-images\/[\w-]+$/.test(value))&&!value.includes('..')?value:validUrl(value);}
function normalizeUrl(value) {const v=String(value||'').trim();return /^[a-z][a-z0-9+.-]*:/i.test(v)?v:v?`https://${v}`:'';}
function publicUrlError(value) {const href=validUrl(value);if(!href)return '올바른 주소를 입력해주세요. (예: www.example.com)';const host=new URL(href).hostname.toLowerCase();return (host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||!host.includes('.')||host.startsWith('[')||/^\d{1,3}(\.\d{1,3}){3}$/.test(host))?'누구나 접속할 수 있는 공개 주소만 등록할 수 있어요.':'';}
const COVER={width:1280,height:720,maxBytes:800*1024,types:['image/png','image/jpeg','image/webp']};
let cover={mode:'keep',data:''};
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
  return `<article class="project-card"><button class="card-open" data-detail="${escapeHtml(p.id)}" aria-label="${escapeHtml(p.title)} 자세히 보기">${artMarkup(p)}<div class="card-info"><div class="card-title-line"><span class="card-title">${escapeHtml(p.title)}</span><span class="card-category">${typeNames[p.type]}</span></div><div class="card-subtitle">${escapeHtml(p.subtitle)}</div><div class="card-metrics"><span class="card-rating">★ ${p.ratingCount?Number(p.rating).toFixed(1):'첫 평가를 기다려요'} <small>${p.ratingCount?'('+Number(p.ratingCount)+')':''}</small></span><span>♡ ${Number(p.recommendations||0)} <span class="metric-divider">·</span> 댓글 ${Number(p.commentCount||0)}</span></div><div class="card-bottom"><span class="creator-dot">${escapeHtml((p.creator||'V')[0].toUpperCase())}</span><span>${escapeHtml(p.creator)}</span><span class="card-availability ${p.status==='upcoming'||p.sample?'upcoming':''}">${p.sample?'예시 작품':p.status==='upcoming'?'공개 준비 중':'● 지금 이용 가능'}</span></div></div></button>${p.badge?`<span class="card-top-tag ${p.featured?'lime':''}">${escapeHtml(p.badge)}</span>`:''}<button class="card-save ${isSaved?'saved':''}" data-save="${escapeHtml(p.id)}" aria-label="${escapeHtml(p.title)} ${isSaved?'찜 취소':'찜하기'}" aria-pressed="${isSaved}">${isSaved?'✓':'+'}</button></article>`;
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
  $('#empty-message').textContent=filter==='saved'&&!query?'마음에 드는 작품의 + 버튼을 눌러 나만의 컬렉션을 만들어보세요.':!query&&['art','video','novel'].includes(filter)?'아직 등록된 작품이 없어요. 첫 번째 작품의 주인공이 되어보세요.':'다른 검색어나 카테고리로 새로운 작품을 찾아보세요.';
  $('#discovery-title').textContent={all:'다음으로 빠져들 작품은?',saved:'다시 만나고 싶은 작품들.',...typeTaglines}[filter];
  $('#row-title').innerHTML=query?`검색 결과 <span class="muted">${escapeHtml($('#search').value)}</span>`:filter==='saved'?'나만의 바이브 컬렉션':'<span class="trending-icon">↗</span> 지금, 주목할 바이브';
  $$('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter));});
  $$('[data-nav]').forEach(b=>b.classList.toggle('active',!document.body.classList.contains('community-view')&&b.dataset.nav===filter));
  $('#saved-count').textContent=saved.size?saved.size:'';
  $('#fresh-section').hidden=filter!=='all'||!!query;
  $('#fresh-grid').innerHTML=projects.filter(p=>['website','app'].includes(p.type)&&p.status!=='upcoming').slice(0,3).map(p=>`<button class="fresh-card" data-detail="${escapeHtml(p.id)}" aria-label="${escapeHtml(p.title)} 자세히 보기">${artMarkup(p)}<div class="fresh-text"><span class="fresh-label">${typeNames[p.type]} <span aria-hidden="true">/</span> ${escapeHtml(p.creator)}</span><h4>${escapeHtml(p.title)}</h4><p>${escapeHtml(p.subtitle)}</p><span class="fresh-cta">발견하기 ↗</span></div></button>`).join('');
  const upcoming=projects.filter(p=>p.status==='upcoming'&&(filter==='all'||filter===p.type)&&!query);
  $('#upcoming-section').hidden=!upcoming.length;
  $('#upcoming-grid').innerHTML=upcoming.map(cardMarkup).join('');
  const mode=query?null:filter==='all'?'home':typeNames[filter]?filter:null;
  renderRows(mode);updateHero(mode);
  updateHeroSave();requestAnimationFrame(updateArrows);
}
// Row layout shared by home, category pages and the community page
const byPopularity=(a,b)=>(b.recommendations||0)-(a.recommendations||0)||(b.rating||0)-(a.rating||0)||b.created-a.created;
const rowItems=r=>!r.items.length?emptyTile(r):r.community?r.items.map(postTile).join(''):r.items.map((p,i)=>r.top?`<div class="nf-ranked"><span class="nf-rank" aria-hidden="true">${i+1}</span>${cardMarkup(p)}</div>`:cardMarkup(p)).join('');
const rowMarkup=(r,i)=>`<section class="nf-row${r.top?' nf-top':''}" id="nf-row-${i}" aria-label="${escapeHtml(r.title)}"><h3 class="nf-row-title">${escapeHtml(r.title)}${r.count?`<span class="nf-row-count">${r.count}</span>`:''}${r.more||''}</h3><div class="nf-row-wrap"><button class="nf-arrow prev" data-row-scroll="-1" aria-label="이전 작품" tabindex="-1">‹</button><div class="nf-scroller">${rowItems(r)}</div><button class="nf-arrow next" data-row-scroll="1" aria-label="다음 작품" tabindex="-1">›</button></div></section>`;
// Category page header: name, tagline, and chips that jump to each genre row
const categoryHead=(title,tagline,total,rows,prefix='',action='')=>`<header class="nf-cat-head">${action}<span class="nf-cat-kicker">CATEGORY</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(tagline)}${total?` · ${total}개`:''}</p>${rows.some(r=>r.chip)?`<nav class="nf-cat-chips" aria-label="${escapeHtml(title)} 장르">${rows.map((r,i)=>r.chip?`<button data-jump="nf-row-${prefix}${i}">${escapeHtml(r.chip)}<span>${r.items.length}</span></button>`:'').join('')}</nav>`:''}</header>`;
let rowsMode=null;
function categoryRows(type){
  const all=projects.filter(p=>p.type===type),live=all.filter(p=>p.status!=='upcoming');
  if(!all.length)return [{title:`${typeNames[type]} 작품`,type,items:[]}];
  const list=genreMap[type]||[];const liveFirst=(a,b)=>(a.status==='upcoming')-(b.status==='upcoming')||byPopularity(a,b);
  const rows=[];
  if(live.length)rows.push({title:`인기 ${typeNames[type]}`,items:[...live].sort(byPopularity)});
  for(const g of list){const items=all.filter(p=>(p.genres||[]).includes(g)).sort(liveFirst);if(items.length)rows.push({title:g,chip:g,count:items.length,items});}
  const other=live.filter(p=>!(p.genres||[]).some(g=>list.includes(g)));
  if(other.length)rows.push({title:`더 많은 ${typeNames[type]}`,chip:'기타',items:other});
  const upcoming=all.filter(p=>p.status==='upcoming');
  if(upcoming.length)rows.push({title:'곧 공개됩니다',items:upcoming});
  return rows;
}
function renderRows(mode){
  rowsMode=mode;
  const host=$('#nf-rows');document.body.classList.toggle('nf-home',!!mode);document.body.classList.toggle('nf-category',!!mode&&mode!=='home');
  const positions=$$('.nf-scroller',host).map(el=>el.scrollLeft);const sameMode=host.dataset.mode===String(mode);host.dataset.mode=String(mode);
  if(!mode){host.innerHTML='';return;}
  if(mode!=='home'){const rows=categoryRows(mode);host.innerHTML=categoryHead(typeNames[mode],typeTaglines[mode],projects.filter(p=>p.type===mode).length,rows)+rows.map(rowMarkup).join('');return;}
  const live=projects.filter(p=>p.status!=='upcoming');
  // Category rows follow the header nav order and stay visible even when empty
  const typeRow=type=>({title:typeNames[type],type,items:live.filter(p=>p.type===type),always:true,more:`<button class="nf-row-more" data-nav-to="${type}">전체 보기 ›</button>`});
  const rows=[
    {title:'지금, 주목할 바이브',items:live.filter(p=>!p.sample).sort((a,b)=>pinRank(a)-pinRank(b))},
    typeRow('website'),typeRow('game'),typeRow('app'),typeRow('art'),typeRow('video'),typeRow('novel'),
    {title:'커뮤니티',community:true,items:homePosts,always:true,more:'<button class="nf-row-more" data-open-community>전체 보기 ›</button>'},
    {title:'내가 찜한 작품',items:projects.filter(p=>saved.has(p.id))},
    {title:'곧 공개됩니다',items:projects.filter(p=>p.status==='upcoming')},
  ].filter(r=>r.always||r.items.length>=(r.min||1));
  host.innerHTML=rows.map(rowMarkup).join('');
  if(sameMode)$$('.nf-scroller',host).forEach((el,i)=>{el.scrollLeft=positions[i]||0;});
}

const postLabels={general:'자유 이야기',showcase:'작품 소개',buildlog:'개발 일지',question:'질문',feedback:'피드백'};
function postTile(p){return `<button class="nf-tile nf-post-tile" data-post="${escapeHtml(p.id)}"><span class="nf-tile-kicker">${escapeHtml(postLabels[p.category]||'이야기')}</span><strong>${escapeHtml(p.title)}</strong><p>${escapeHtml(p.body.slice(0,90))}</p><span class="nf-tile-meta">${escapeHtml(p.author_name)} · ♡ ${Number(p.recommendations)} · 댓글 ${Number(p.comments)}</span></button>`;}
function emptyTile(r){return r.community?'<div class="nf-tile nf-empty-tile"><strong>첫 번째 이야기를 들려주세요.</strong><p>만드는 과정도, 작은 질문도 좋은 이야기의 시작이에요.</p><button class="secondary-button" data-compose-post>＋ 이야기 쓰기</button></div>':`<div class="nf-tile nf-empty-tile"><strong>아직 올라온 ${typeNames[r.type]} 작품이 없어요.</strong><p>첫 번째 작품의 주인공이 되어보세요.</p><button class="secondary-button" data-upload-empty>＋ 작품 올리기</button></div>`;}
// community.js shares the newest posts so the home row stays in sync with the board
document.addEventListener('vibe:posts',event=>{homePosts=event.detail;if(rowsMode==='home')renderRows('home');if(document.body.classList.contains('community-view'))renderCommunityRows();});
function setCommunityView(on){document.body.classList.toggle('community-view',on);$('#community-nav').classList.toggle('active',on);if(on){$$('[data-nav]').forEach(b=>b.classList.remove('active'));window.scrollTo({top:0});renderCommunityRows();}}
// Community page: one row per board category above the full board
let communityRowsGeneration=0;
async function renderCommunityRows(){
  const host=$('#community-rows');const generation=++communityRowsGeneration;
  const groups=[{key:'popular',title:'인기 이야기',query:'sort=popular'},...Object.entries(postLabels).sort(([a],[b])=>['showcase','buildlog','question','feedback','general'].indexOf(a)-['showcase','buildlog','question','feedback','general'].indexOf(b)).map(([key,title])=>({key,title,chip:title,query:`category=${key}&sort=newest`}))];
  const results=await Promise.all(groups.map(g=>fetch(`/api/community/posts?${g.query}&limit=30`).then(r=>r.ok?r.json():{posts:[]}).then(d=>d.posts||[]).catch(()=>[])));
  if(generation!==communityRowsGeneration)return;
  results[0]=results[0].filter(p=>Number(p.recommendations)>0); // "인기" only once something has been liked
  const rows=groups.map((g,i)=>({title:g.title,chip:g.chip,community:true,items:results[i],count:results[i].length||0})).filter((r,i)=>i>0||r.items.length);
  host.innerHTML=categoryHead('커뮤니티','만드는 과정도, 써본 경험도. 바이브를 나누는 크리에이터들의 공간.',0,rows,'c','<button class="primary-button nf-cat-action" data-compose-post>＋ 이야기 쓰기</button>')+rows.map((r,i)=>rowMarkup({...r,count:r.items.length||''},`c${i}`)).join('');
}
document.addEventListener('click',event=>{
  const jump=event.target.closest('[data-jump]');if(jump){document.getElementById(jump.dataset.jump)?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  const navTo=event.target.closest('[data-nav-to]');if(navTo){setFilter(navTo.dataset.navTo,true);return;}
  if(event.target.closest('[data-open-community]'))setCommunityView(true);
  else if(event.target.closest('[data-compose-post]'))window.VibeCommunity?.openCompose();
  else if(event.target.closest('[data-upload-empty]'))openUpload();
});
document.addEventListener('click',event=>{const button=event.target.closest('[data-row-scroll]');if(!button)return;const scroller=$('.nf-scroller',button.parentElement);scroller.scrollBy({left:Number(button.dataset.rowScroll)*scroller.clientWidth*.85,behavior:'smooth'});});
{const header=$('.header');const onScroll=()=>header.classList.toggle('scrolled',window.scrollY>20);window.addEventListener('scroll',onScroll,{passive:true});onScroll();}
function setFilter(next,scroll=false){setCommunityView(false);filter=next;render();$('#project-row').scrollLeft=0;if(scroll){if(typeNames[next]&&!query)window.scrollTo({top:0});else $('#discover').scrollIntoView({behavior:'smooth'});}}
async function toggleSave(id){
  if(!findProject(id))return;
  if(user){try{const response=await fetch('/api/community/bookmarks',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:id,active:!saved.has(id)})});if(!response.ok){const result=await response.json();throw Error(result.error);}}catch(error){toast(error.message||'찜 목록을 저장하지 못했어요.');return;}}
  if(saved.has(id)){saved.delete(id);toast('찜한 작품에서 삭제했어요.');}else{saved.add(id);toast('나만의 바이브 컬렉션에 추가했어요.');}
  if(!user)try{localStorage.setItem('vibeflix.saved.v2',JSON.stringify([...saved]));}catch{toast('브라우저 저장 공간이 없어 이번 방문에서만 유지됩니다.');}
  const position=$('#project-row').scrollLeft;render();$('#project-row').scrollLeft=position;
  if(detailId===id&&$('#detail-dialog').open){$('#detail-save').textContent=saved.has(id)?'✓ 찜했어요':'＋ 찜하기';$('#detail-save').setAttribute('aria-pressed',String(saved.has(id)));}
}
function updateHeroSave(){const state=saved.has(currentFeatured);$('#hero-save').classList.toggle('saved',state);$('#hero-save').textContent=state?'✓':'＋';$('#hero-save').setAttribute('aria-pressed',String(state));$('#hero-save').setAttribute('aria-label',`${findProject(currentFeatured)?.title||'작품'} ${state?'찜 취소':'찜하기'}`);}
const sampleCta={novel:'예시 1화 읽기 →',art:'예시 작품 보기 →',video:'▶ 예시 영상 보기'};
function openDetail(id){
  const p=findProject(id);if(!p)return;detailId=id;
  const url=validUrl(p.url);
  $('#detail-content').innerHTML=`<div class="detail-cover">${artMarkup(p)}</div><div class="detail-body"><div class="detail-overline"><span class="type-label">${typeNames[p.type]}</span><span>${p.sample?'SAMPLE · 예시 작품':p.status==='upcoming'?'IN DEVELOPMENT':p.badge==='COMMUNITY'?'COMMUNITY PROJECT':'MADE BY DEEPCHOI'}</span></div><h2 id="detail-title">${escapeHtml(p.title)}</h2><p class="detail-subtitle">${escapeHtml(p.subtitle)}</p><p class="detail-description">${escapeHtml(p.description)}</p>${(p.gallery||[]).length?`<div class="detail-gallery">${p.gallery.filter(imageUrl).map((src,i)=>`<img src="${escapeHtml(imageUrl(src))}" alt="${escapeHtml(p.title)} 소개 이미지 ${i+1}" loading="lazy">`).join('')}</div>`:''}<div class="detail-creator"><span class="creator-dot">${escapeHtml((p.creator||'V')[0].toUpperCase())}</span>Created by ${escapeHtml(p.creator)}</div><div class="detail-tags">${(p.tags||[]).map(t=>`<span>#${escapeHtml(t)}</span>`).join('')}</div><div class="detail-actions">${p.sample?`<a class="primary-button" href="/samples/${encodeURIComponent(p.id)}">${sampleCta[p.type]||'예시 보기'}</a>`:url?`<a class="primary-button" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${ctaLabels[p.type]||'서비스 바로가기 ↗'}</a>`:'<button class="primary-button" disabled>공개 준비 중</button>'}<button class="secondary-button" id="detail-save" aria-pressed="${saved.has(id)}">${saved.has(id)?'✓ 찜했어요':'＋ 찜하기'}</button></div><p class="detail-notice">${p.sample?'화면 구성을 보여주기 위해 운영자가 만든 예시 작품이에요. 사이트 안의 예시 페이지에서 볼 수 있어요.':url?'작품 페이지가 새 탭에서 열립니다. 서비스별로 별도 로그인이 필요할 수 있어요.':'아직 공개 플레이 링크가 준비되지 않았습니다. 정식 공개를 기다려주세요.'}</p>${p.owned?'<button class="remove-project" id="remove-project">내 작품을 공개 목록에서 내리기</button>':''}</div>`;
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
function openSearch(){setCommunityView(false);$('#search-wrap').hidden=false;$('#discover').scrollIntoView({behavior:'smooth'});$('#search').focus({preventScroll:true});$('#search-toggle').setAttribute('aria-expanded','true');}
$('#search-toggle').setAttribute('aria-expanded','false');$('#search-toggle').addEventListener('click',openSearch);
$('#search').addEventListener('input',event=>{query=event.target.value.trim().toLowerCase();render();});
$('#search-close').addEventListener('click',()=>{$('#search-wrap').hidden=true;$('#search').value='';query='';render();$('#search-toggle').setAttribute('aria-expanded','false');$('#search-toggle').focus();});
$('#reset-filters').addEventListener('click',()=>{$('#search').value='';query='';setFilter('all');});
$('#profile-button').addEventListener('click',()=>window.VibeCommunity?.openProfile());$('#hero-info').addEventListener('click',()=>openDetail(currentFeatured));$('#hero-save').addEventListener('click',()=>toggleSave(currentFeatured));
// Hero slides are managed in /admin (banners). These built-in slides show until the catalog loads, or if it fails.
let featured=[
  {id:'banner-koiworld',projectId:'koiworld',title:'코이월드',description:'어떤 무늬의 코이가 태어날까요?\n키우고, 교배하고, 수집하는 나만의 작은 힐링.',buttonLabel:'지금 플레이',buttonIcon:'play',url:'https://koigarden.shop/',theme:'koi',image:'/assets/koi-icon.png'},
  {id:'banner-fishing',projectId:'fishing',title:'네모낚시',description:'블록으로 만든 저수지에서 즐기는 좌대 낚시.\n채비를 고르고, 찌를 바라보고, 대물을 만나보세요.',buttonLabel:'지금 플레이',buttonIcon:'play',url:'https://voxel-fishing-choi.web.app/',theme:'fishing',image:'/assets/fishing-lake.jpg'},
  {id:'banner-dayflow',projectId:'dayflow',title:'Dayflow',description:'일정, 할 일, 메모, 그리고 AI와의 대화.\n복잡한 하루를 나만의 속도로 정리하는 공간.',buttonLabel:'서비스 바로가기 ↗',buttonIcon:'none',url:'https://dayflow.web.app/',theme:'dayflow',image:'/assets/dayflow-screen.jpg'}
];
let featuredIndex=0;
let homeBanners=featured,heroKey='';
// Category pages keep a hero: banners linked to that category's works, otherwise its top works as thumbnail-card slides
function heroSlides(mode){
  // samples only headline their own category page, never home
  if(!mode||mode==='home'){const real=homeBanners.filter(b=>!findProject(b.projectId)?.sample);return real.length?real:homeBanners;}
  const linked=homeBanners.filter(b=>findProject(b.projectId)?.type===mode);
  if(linked.length)return linked;
  return projects.filter(p=>p.type===mode&&p.status!=='upcoming'&&p.image).sort((a,b)=>pinRank(a)-pinRank(b)||byPopularity(a,b)).slice(0,3)
    .map(p=>({id:`auto-${p.id}`,projectId:p.id,title:p.title,description:p.subtitle||'',buttonLabel:p.type==='game'?'지금 플레이':'바로가기 ↗',buttonIcon:p.type==='game'?'play':'none',url:p.url,theme:'cover',image:p.image}));
}
function updateHero(mode){
  const slides=heroSlides(mode);const key=`${mode}:${slides.map(s=>s.id).join(',')}`;
  $('.hero-carousel').hidden=!slides.length;
  if(!slides.length||key===heroKey)return;
  heroKey=key;const keep=featured[featuredIndex]?.id;featured=slides;featuredIndex=Math.max(0,featured.findIndex(b=>b.id===keep));selectFeatured(featuredIndex);
}
// Side peeks show the linked work's cover; custom banners show their own backdrop
const peekImage=f=>f.theme==='custom'?f.image:(findProject(f.projectId)?.image||f.image);
function selectFeatured(value){
  const index=(value+featured.length)%featured.length;const f=featured[index];featuredIndex=index;
  // before the catalog arrives, trust the slide's link so the buttons don't flicker
  const project=f.projectId?(findProject(f.projectId)||(projects.length?null:{id:f.projectId})):null;currentFeatured=project?project.id:'';
  const hero=$('.hero');hero.dataset.feature=f.theme;hero.setAttribute('aria-label',`추천 작품 ${f.title}`);
  $('.hero h1').textContent=f.title;$('.hero-description').innerHTML=escapeHtml(f.description).replace(/\n/g,'<br>');
  // 'cover' slides fall back to the linked work's thumbnail, shown as a card over its own blurred copy
  const image=f.image||(f.theme==='cover'?project?.image:'')||'';
  $('.hero-image').style.backgroundImage=(f.theme==='custom'||f.theme==='cover')&&image?`url("${image}")`:'';
  if(f.theme==='custom'||!image)$('#hero-art-image').removeAttribute('src');else $('#hero-art-image').src=image;
  const play=$('#hero-play'),external=/^https?:/.test(f.url||'');play.hidden=!f.url;play.href=f.url||'#';
  if(external){play.target='_blank';play.rel='noopener noreferrer';}else{play.removeAttribute('target');play.removeAttribute('rel');}
  play.innerHTML=(f.buttonIcon==='play'?'<span class="play-icon">▶</span> ':'')+escapeHtml(f.buttonLabel||'바로가기');
  $('#hero-info').hidden=$('#hero-save').hidden=!project;
  const many=featured.length>1;
  for(const [selector,offset] of [['.hero-peek-prev',-1],['.hero-peek-next',1]]){
    const adjacent=featured[(index+offset+featured.length)%featured.length];const peek=$(selector);peek.hidden=!many;
    peek.style.backgroundImage=`linear-gradient(#0003,#0006),url("${peekImage(adjacent)}")`;
    peek.setAttribute('aria-label',`${offset<0?'이전':'다음'} 추천 작품: ${adjacent.title}`);
  }
  $('.slide-lines').hidden=!many;
  $('.slide-lines').innerHTML=featured.map((b,i)=>`<button class="${i===index?'selected':''}" data-slide="${i}" aria-label="추천 작품 ${escapeHtml(b.title)}" aria-pressed="${i===index}"></button>`).join('');
  updateHeroSave();
}
$('.slide-lines').addEventListener('click',event=>{const dot=event.target.closest('[data-slide]');if(dot)selectFeatured(Number(dot.dataset.slide));});
$('.hero-peek-prev').addEventListener('click',()=>selectFeatured(featuredIndex-1));
$('.hero-peek-next').addEventListener('click',()=>selectFeatured(featuredIndex+1));
$('.hero-carousel').addEventListener('keydown',event=>{
  if(!event.target.closest('.hero-peek,[data-slide]'))return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();selectFeatured(featuredIndex+(event.key==='ArrowLeft'?-1:1));}
});
let heroTouch=null;
$('.hero').addEventListener('touchstart',event=>{heroTouch=event.touches.length===1&&!event.target.closest('button,a')?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;},{passive:true});
$('.hero').addEventListener('touchend',event=>{if(!heroTouch)return;const dx=event.changedTouches[0].clientX-heroTouch.x,dy=event.changedTouches[0].clientY-heroTouch.y;heroTouch=null;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.3)selectFeatured(featuredIndex+(dx<0?1:-1));},{passive:true});
$('.hero').addEventListener('touchcancel',()=>{heroTouch=null;},{passive:true});
selectFeatured(0);
// ChatGPT sign-in only exists on ChatGPT Sites; hide it where /signin-with-chatgpt is missing (fails open on network errors).
fetch('/signin-with-chatgpt',{method:'HEAD',redirect:'manual'}).then(r=>r.status!==404,()=>true).then(available=>{if(!available)document.documentElement.classList.add('no-chatgpt');}).catch(()=>{});
$('#upload-login').addEventListener('click',()=>{$('#upload-dialog').close();window.VibeCommunity?.login('upload');});
async function loadSession(){
  try{const response=await fetch('/api/session');if(!response.ok)throw Error('로그인 확인 실패');const data=await response.json();user=data.user;}catch{user=null;}
  $('#sign-in').hidden=!!user;$('#profile-button').hidden=!user;$('#sign-out').hidden=!user;$('#admin-link').hidden=!user?.isAdmin;
  if(user){$('#profile-button').textContent=user.name[0].toUpperCase();$('#profile-button').title=`${user.name} · 찜한 작품`;}
  document.dispatchEvent(new CustomEvent('vibe:auth',{detail:user}));
}
const sessionReady=loadSession();
// Genre chips in the upload form follow the selected category (max 3)
let uploadGenres=new Set();
function renderUploadGenres(){
  const box=$('#upload-genres');if(!box)return;const list=genreMap[$('#upload-form').elements.namedItem('type').value]||[];
  for(const g of uploadGenres)if(!list.includes(g))uploadGenres.delete(g);
  box.innerHTML=list.map(g=>`<button type="button" class="genre-chip${uploadGenres.has(g)?' selected':''}" data-genre="${escapeHtml(g)}" aria-pressed="${uploadGenres.has(g)}">${escapeHtml(g)}</button>`).join('');
  box.closest('.genre-field').hidden=!list.length;
}
$('#upload-form').elements.namedItem('type').addEventListener('change',renderUploadGenres);
$('#upload-genres').addEventListener('click',event=>{const chip=event.target.closest('[data-genre]');if(!chip)return;const g=chip.dataset.genre;if(uploadGenres.has(g))uploadGenres.delete(g);else if(uploadGenres.size>=3){toast('장르는 3개까지 고를 수 있어요.');return;}else uploadGenres.add(g);renderUploadGenres();});
async function openUpload(editId){await sessionReady;editingProjectId=typeof editId==='string'?editId:null;const p=editingProjectId?findProject(editingProjectId):null;const form=$('#upload-form');if(p){for(const key of ['title','creator','type','url','description'])form.elements.namedItem(key).value=p[key]||'';}else if(form.dataset.editing){form.reset();}uploadGenres=new Set(p?.genres||(form.dataset.editing?[]:uploadGenres));renderUploadGenres();coverError('');setCover('keep','',p&&imageUrl(p.image));galleryError('');setGallery((p?.gallery||[]).filter(src=>/^\/api\/project-images\/[\w-]+$/.test(src)).map(src=>({id:src.split('/').pop(),src})));updateDescriptionCount();form.dataset.editing=editingProjectId||'';if(user){form.elements.namedItem('creator').value=user.name;form.elements.namedItem('creator').readOnly=true;}$('#upload-dialog h2').textContent=p?'작품 소개를 다듬어주세요.':'당신의 작품을 소개해주세요.';$('#upload-form').hidden=!user;$('#upload-auth').hidden=!!user;$('#form-error').hidden=true;if(!$('#upload-dialog').open)$('#upload-dialog').showModal();}
const GALLERY={max:4,maxBytes:700*1024,maxWidth:1600};
let gallery=[];
function galleryError(message){const el=$('#gallery-error');el.textContent=message||'';el.hidden=!message;}
function setGallery(items){
  gallery=items;const list=$('#gallery-list');
  list.innerHTML=gallery.map((item,i)=>`<figure class="gallery-thumb"><img src="${escapeHtml(item.src)}" alt="소개 이미지 ${i+1}"><button type="button" data-gallery-remove="${i}" aria-label="소개 이미지 ${i+1} 삭제">✕</button></figure>`).join('');
  list.hidden=!gallery.length;$('#gallery-add').hidden=gallery.length>=GALLERY.max;
}
// Downscale + re-encode in the browser so any normal photo or illustration fits the upload budget.
async function shrinkImage(file){
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(Error('open'));el.src=url;});
    let scale=Math.min(1,GALLERY.maxWidth/img.naturalWidth,4096/img.naturalHeight);
    for(let attempt=0;attempt<6;attempt++){
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      for(const quality of [.88,.78,.66,.55]){
        let blob=await new Promise(r=>canvas.toBlob(r,'image/webp',quality));
        if(!blob||blob.type!=='image/webp')blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));
        if(blob&&blob.size<=GALLERY.maxBytes)return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
      }
      scale*=.8;
    }
    throw Error('too large');
  }finally{URL.revokeObjectURL(url);}
}
$('#gallery-add').addEventListener('click',()=>$('#gallery-file').click());
$('#gallery-list').addEventListener('click',event=>{const button=event.target.closest('[data-gallery-remove]');if(!button)return;galleryError('');setGallery(gallery.filter((_,i)=>i!==Number(button.dataset.galleryRemove)));});
$('#gallery-file').addEventListener('change',async event=>{
  const files=[...event.target.files];event.target.value='';if(!files.length)return;galleryError('');
  const room=GALLERY.max-gallery.length;const problems=[];
  if(files.length>room)problems.push(`최대 ${GALLERY.max}장까지라서 ${files.length-room}장은 제외했어요.`);
  const next=[...gallery];$('#gallery-add').disabled=true;$('#gallery-add').textContent='이미지 최적화 중…';
  for(const file of files.slice(0,room)){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){problems.push(`${file.name}: PNG, JPG, WebP만 올릴 수 있어요.`);continue;}
    if(file.size>20*1024*1024){problems.push(`${file.name}: 20MB 이하 이미지만 올릴 수 있어요.`);continue;}
    try{const data=await shrinkImage(file);next.push({data,src:data});}catch{problems.push(`${file.name}: 이미지를 처리하지 못했어요.`);}
  }
  $('#gallery-add').disabled=false;$('#gallery-add').textContent='＋ 내 컴퓨터에서 이미지 추가';setGallery(next);galleryError(problems.join(' '));
});
function setCover(mode,data,existing){
  cover={mode,data};const preview=$('#cover-preview');const img=$('img',preview);
  const src=mode==='new'?data:mode==='keep'?(existing||''):'';
  preview.hidden=!src;if(src)img.src=src;else img.removeAttribute('src');
  $('#cover-info').textContent=mode==='new'?`${COVER.width} × ${COVER.height}px · ${Math.round(data.length*0.75/1024)}KB`:mode==='keep'&&src?'현재 등록된 커버 이미지':'';
  $('#cover-clear').hidden=!src;$('#cover-pick').textContent=src?'다른 이미지 선택':'내 컴퓨터에서 이미지 선택';$('#cover-file').value='';
}
function coverError(message){const el=$('#cover-error');el.textContent=message||'';el.hidden=!message;}
function updateDescriptionCount(){$('#description-count').textContent=$('#upload-description').value.length.toLocaleString('ko-KR');}
$('#upload-description').addEventListener('input',updateDescriptionCount);
$('#cover-pick').addEventListener('click',()=>$('#cover-file').click());
$('#cover-clear').addEventListener('click',()=>{coverError('');setCover('remove','');});
$('#cover-file').addEventListener('change',event=>{
  const file=event.target.files[0];if(!file)return;coverError('');
  const reject=message=>{coverError(message);event.target.value='';};
  if(!COVER.types.includes(file.type))return reject('PNG, JPG, WebP 형식의 이미지만 올릴 수 있어요.');
  if(file.size>COVER.maxBytes)return reject(`파일이 너무 커요. (${(file.size/1024).toFixed(0)}KB) ${COVER.maxBytes/1024}KB 이하로 줄여주세요.`);
  const reader=new FileReader();
  reader.onerror=()=>reject('이미지를 읽을 수 없어요. 다른 파일을 선택해주세요.');
  reader.onload=()=>{
    const probe=new Image();
    probe.onerror=()=>reject('이미지를 열 수 없어요. 손상된 파일일 수 있어요.');
    probe.onload=()=>{
      if(probe.naturalWidth!==COVER.width||probe.naturalHeight!==COVER.height)return reject(`이미지 크기가 맞지 않아요. (현재 ${probe.naturalWidth} × ${probe.naturalHeight}px) ${COVER.width} × ${COVER.height}px로 맞춰서 다시 올려주세요.`);
      setCover('new',reader.result);
    };
    probe.src=reader.result;
  };
  reader.readAsDataURL(file);
});
$('#upload-open').addEventListener('click',openUpload);$('#banner-upload').addEventListener('click',openUpload);
$('#upload-form').addEventListener('submit',async event=>{
  event.preventDefault();if(submitting)return;const form=event.target;const data=new FormData(form);const payload=Object.fromEntries(data);$('#form-error').hidden=true;
  const urlField=form.elements.namedItem('url');payload.url=normalizeUrl(payload.url);const urlProblem=publicUrlError(payload.url);if(urlProblem){urlField.setCustomValidity(urlProblem);urlField.reportValidity();urlField.addEventListener('input',()=>urlField.setCustomValidity(''),{once:true});return;}
  payload.gallery=gallery.map(item=>item.id||item.data);
  if(cover.mode==='new')payload.image=cover.data;else if(cover.mode==='remove')payload.image='';
  payload.genres=[...uploadGenres];
  for(const name of ['title','creator','description']){const field=form.elements.namedItem(name);if(!String(data.get(name)).trim()){field.setCustomValidity('공백 이외의 내용을 입력해주세요.');field.reportValidity();field.addEventListener('input',()=>field.setCustomValidity(''),{once:true});return;}}
  submitting=true;const button=$('button[type="submit"]',form);button.disabled=true;button.textContent='작품을 등록하는 중…';
  try{
    const response=await fetch(editingProjectId?`/api/projects/${encodeURIComponent(editingProjectId)}`:'/api/projects',{method:editingProjectId?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json().catch(()=>({}));
    if(!response.ok){if(response.status===401){user=null;$('#upload-form').hidden=true;$('#upload-auth').hidden=false;}throw Error(result.error||'등록에 실패했어요. 잠시 후 다시 시도해주세요.');}
    const edited=!!editingProjectId;editingProjectId=null;form.reset();uploadGenres.clear();renderUploadGenres();setCover('keep','');setGallery([]);updateDescriptionCount();delete form.dataset.editing;$('#upload-dialog').close();query='';$('#search').value='';sort='newest';$('#sort').value='newest';await loadCatalog();setFilter('all',true);toast(edited?'작품 소개를 수정했어요.':'작품이 공개되었어요. 이제 다른 방문자도 볼 수 있어요.');
  }catch(error){$('#form-error').textContent=error.message||'네트워크 연결을 확인하고 다시 시도해주세요.';$('#form-error').hidden=false;}
  finally{submitting=false;button.disabled=false;button.innerHTML='공개 등록하기 <span>↗</span>';}
});
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$$('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
$('#about-button').addEventListener('click',()=>$('#about-dialog').showModal());
document.addEventListener('keydown',event=>{if(event.key==='/'&&!$('dialog[open]')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){event.preventDefault();openSearch();}});
// Operator settings from /admin: a notice strip and the pinned order of the highlight row
function applySite(site){
  pinnedIds=Array.isArray(site?.pinned)?site.pinned:[];
  const notice=$('#site-notice');const text=site?.notice||'';notice.hidden=!text;
  notice.innerHTML=text?(site.noticeUrl?`<a href="${escapeHtml(site.noticeUrl)}"${/^https?:/.test(site.noticeUrl)?' target="_blank" rel="noopener noreferrer"':''}>${escapeHtml(text)} <span aria-hidden="true">→</span></a>`:`<span>${escapeHtml(text)}</span>`):'';
  document.body.classList.toggle('has-notice',!!text);
}
async function loadCatalog(){
  let message='';
  try{const response=await fetch('/api/projects');const result=await response.json();if(!Array.isArray(result.projects))throw Error('잘못된 응답');projects=result.projects;message=result.error||'';applySite(result.site);if(result.genres){genreMap=result.genres;renderUploadGenres();}if(Array.isArray(result.banners)&&result.banners.length)homeBanners=result.banners;heroKey='';}
  catch{try{const response=await fetch('/catalog.json');if(!response.ok)throw Error();projects=await response.json();message='커뮤니티 작품을 불러오지 못했습니다. 기본 서비스는 계속 이용할 수 있어요.';}catch{message='작품을 불러올 수 없습니다. 연결을 확인한 뒤 새로고침해주세요.';}}
  $('#catalog-status').hidden=!message;$('#catalog-status').textContent=message;render();
  document.dispatchEvent(new CustomEvent('vibe:catalog'));
}
loadCatalog();
if(new URL(location.href).searchParams.get('upload')==='1')openUpload();
window.Vibe={getUser:()=>user,getProjects:()=>projects,getSaved:()=>[...saved],setSaved:ids=>{saved=new Set(ids);render();},refreshAuth:loadSession,reload:loadCatalog,openDetail,openUpload,render,artMarkup,toast,escapeHtml,setFilter,setCommunityView,patchProject:(id,patch)=>{const p=findProject(id);if(p)Object.assign(p,patch);render();}};
