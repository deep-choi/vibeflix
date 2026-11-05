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
let homePosts = [];
let pinnedIds = [];
let genreMap = {}; // category → genre list, from /api/projects (public/genres.json)
let collections = []; // operator-curated rows (기획전), live ones only
let catalogComplete = false; // all catalog pages have arrived (search misses are only reported after that)
const typeTaglines = {website:'아이디어를 만나는 새로운 창.',game:'플레이 버튼 너머의 새로운 세계.',app:'일상에 작은 변화를 더하는 앱.',art:'상상이 그림이 되는 순간.',video:'움직이는 상상, 영상.',novel:'한 줄에서 시작되는 이야기.'};
const pinRank = p => { const i = pinnedIds.indexOf(p.id); return i < 0 ? 1e9 : i; };
let saved;
try {const value=JSON.parse(localStorage.getItem('vibeflix.saved.v2') || '[]');saved=new Set(Array.isArray(value)?value.filter(id=>typeof id==='string'):[]);} catch {saved=new Set();}
function validUrl(value) {try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
function imageUrl(value) {return typeof value==='string'&&(value.startsWith('/assets/')||/^\/api\/projects\/[\w-]+\/cover(\?v=\d+)?$/.test(value)||/^\/api\/project-images\/[\w-]+$/.test(value))&&!value.includes('..')?value:validUrl(value);}
function toast(message) {window.DS?.toast(message);}
let myDrafts = [];
const findProject = id => projects.find(p=>p.id===id) || myDrafts.find(p=>p.id===id);

// A missing cover: a quiet gradient (tone picked from the id) with the category's icon (ds.css .cover-ph)
const coverTone=id=>[...String(id||'')].reduce((n,c)=>n+c.charCodeAt(0),0)%6;
const coverPlaceholder=p=>`<div class="cover-ph" data-type="${escapeHtml(p.type)}" data-tone="${coverTone(p.id)}" aria-hidden="true"></div>`;
// Thumbnails are pictures only: the title is printed under each card, so nothing is drawn into the art in a font.
function artMarkup(p) {
  const art=['koiworld','dayflow','fishing','learnhub','deepchoi','godoftop','voyage'].includes(p.art)?p.art:'custom';
  let content;
  if(art==='koiworld')content='<img class="art-icon" src="/assets/koi-icon.png" alt="" loading="lazy">';
  else if(art==='dayflow')content='<div class="screen-frame"><img src="/assets/dayflow-screen.jpg" alt="" loading="lazy"></div>';
  else if(art==='fishing')content='<img class="cover-image" src="/assets/fishing-lake.jpg" alt="" loading="lazy">';
  else if(art==='learnhub')content='<div class="screen-frame"><img src="/assets/learnhub-screen.jpg" alt="" loading="lazy"></div>';
  else if(art==='deepchoi')content='<img class="cover-image" src="/assets/deepchoi-cover.png" alt="" loading="lazy">';
  else if(art==='godoftop')content='<div class="tower-visual"><i></i><i></i><i></i><i></i></div>';
  else if(art==='voyage')content='<img class="cover-image" src="/assets/mountain.jpg" alt="" loading="lazy"><span class="concept-label">콘셉트 이미지</span>';
  else content=imageUrl(p.image)?`<img class="cover-image" src="${escapeHtml(imageUrl(p.image))}" alt="" loading="lazy" referrerpolicy="no-referrer">`:coverPlaceholder(p);
  // works marked 성인 소재 keep their cover blurred in lists; the work page asks before showing anything
  const mature=(p.details?.warnings||[]).includes('mature');
  // operator samples say so on the picture itself (the covers carry no baked-in text)
  return `<div class="card-art${mature?' mature':''}"><div class="art-main art-${art}">${content}</div>${mature?'<span class="mature-label">성인 소재</span>':p.sample?'<span class="sample-label">예시</span>':''}</div>`;
}
function cardMarkup(p) {
  const isSaved=saved.has(p.id);
  return `<article class="project-card"><button class="card-open" data-detail="${escapeHtml(p.id)}" aria-label="${escapeHtml(p.title)} 자세히 보기">${artMarkup(p)}<span class="card-caption" aria-hidden="true">${escapeHtml(p.title)}</span><div class="card-info"><div class="card-title-line"><span class="card-title">${escapeHtml(p.title)}</span><span class="card-category">${typeNames[p.type]}</span></div><div class="card-subtitle">${escapeHtml(p.subtitle)}</div><div class="card-metrics"><span class="card-rating">★ ${p.ratingCount?Number(p.rating).toFixed(1):'첫 평가를 기다려요'} <small>${p.ratingCount?'('+Number(p.ratingCount)+')':''}</small></span><span>♡ ${Number(p.recommendations||0)} <span class="metric-divider">·</span> 댓글 ${Number(p.commentCount||0)}</span></div><div class="card-bottom"><span class="creator-dot">${escapeHtml((p.creator||'V')[0].toUpperCase())}</span><span>${escapeHtml(p.creator)}</span><span class="card-availability ${p.status==='upcoming'||p.sample?'upcoming':''}">${p.sample?'예시 작품':p.status==='upcoming'?'공개 준비 중':'● 지금 이용 가능'}</span></div></div></button>${p.badge?`<span class="card-top-tag ${p.featured?'lime':''}">${escapeHtml(p.badge)}</span>`:''}<button class="card-save ${isSaved?'saved':''}" data-save="${escapeHtml(p.id)}" aria-label="${escapeHtml(p.title)} ${p.status==='upcoming'?(isSaved?'출시 알림 취소':'출시 알림 받기'):(isSaved?'찜 취소':'찜하기')}" title="${p.status==='upcoming'?(isSaved?'출시 알림 신청함':'출시 알림 받기'):''}" aria-pressed="${isSaved}">${isSaved?'✓':'+'}</button></article>`;
}
function render() {
  let list=projects.filter(p=>(filter==='saved'?saved.has(p.id):(p.status!=='upcoming'||!!query)&&(filter==='all'||filter===p.type))&&`${p.title} ${p.subtitle} ${p.creator} ${p.description} ${(p.tags||[]).join(' ')} ${(p.details?.stack||[]).join(' ')} ${(p.details?.making?.tools||[]).join(' ')}`.toLowerCase().includes(query));
  if(sort==='newest')list.sort((a,b)=>b.created-a.created);
  if(sort==='name')list.sort((a,b)=>a.title.localeCompare(b.title,'ko'));
  if(sort==='rating')list.sort((a,b)=>(b.rating||0)-(a.rating||0)||(b.ratingCount||0)-(a.ratingCount||0));
  if(sort==='popular')list.sort((a,b)=>(b.recommendations||0)-(a.recommendations||0));
  $('#project-row').innerHTML=list.map(cardMarkup).join('');
  $('#result-count').textContent=`${list.length}개의 작품`;
  if(query&&!list.length)reportSearchMiss(query);
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
const rowItems=r=>!r.items.length?emptyTile(r):r.community?r.items.map(postTile).join(''):r.feed?r.items.map(feedTile).join(''):r.recent?r.items.map(recentTile).join(''):r.items.map((p,i)=>r.top?`<div class="nf-ranked"><span class="nf-rank" aria-hidden="true">${i+1}</span>${cardMarkup(p)}</div>`:cardMarkup(p)).join('');
const rowMarkup=(r,i)=>`<section class="nf-row${r.top?' nf-top':''}${r.sub?' nf-has-sub':''}" id="nf-row-${i}" aria-label="${escapeHtml(r.title)}"><h3 class="nf-row-title">${escapeHtml(r.title)}${r.count?`<span class="nf-row-count">${r.count}</span>`:''}${r.more||''}</h3>${r.sub?`<p class="nf-row-sub">${escapeHtml(r.sub)}</p>`:''}<div class="nf-row-wrap"><button class="nf-arrow prev" data-row-scroll="-1" aria-label="이전 작품" tabindex="-1">‹</button><div class="nf-scroller">${rowItems(r)}</div><button class="nf-arrow next" data-row-scroll="1" aria-label="다음 작품" tabindex="-1">›</button></div></section>`;
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
  if(mode!=='home'){const rows=categoryRows(mode);host.innerHTML=categoryHead(typeNames[mode],typeTaglines[mode],projects.filter(p=>p.type===mode).length,rows)+(mode==='website'?stackChips():'')+rows.map(rowMarkup).join('');return;}
  const live=projects.filter(p=>p.status!=='upcoming');
  // Category rows follow the header nav order and stay visible even when empty
  const typeRow=type=>({title:typeNames[type],type,items:live.filter(p=>p.type===type),always:true,more:`<button class="nf-row-more" data-nav-to="${type}">전체 보기 ›</button>`});
  const recent=recentWorks();
  const feed=feedItems.length?[{title:'팔로우한 작가의 새 소식',feed:true,items:feedItems}]:[];
  const curated=collections.map(c=>({title:c.title,sub:c.description,items:c.projectIds.map(id=>findProject(id)).filter(p=>p&&!p.draft)})).filter(r=>r.items.length);
  const rows=[
    ...(recent.length?[{title:'이어서 볼 작품',recent:true,items:recent,more:'<button class="nf-row-more" data-clear-recent>기록 지우기</button>'}]:[]),
    ...feed,
    {title:'지금, 주목할 바이브',items:live.filter(p=>!p.sample).sort((a,b)=>pinRank(a)-pinRank(b))},
    ...curated,
    typeRow('website'),typeRow('game'),typeRow('app'),typeRow('art'),typeRow('video'),typeRow('novel'),
    {title:'커뮤니티',community:true,items:homePosts,always:true,more:'<button class="nf-row-more" data-open-community>전체 보기 ›</button>'},
    {title:'내가 찜한 작품',items:projects.filter(p=>saved.has(p.id))},
    {title:'곧 공개됩니다',items:projects.filter(p=>p.status==='upcoming')},
  ].filter(r=>r.always||r.items.length>=(r.min||1));
  host.innerHTML=rows.map(rowMarkup).join('');
  if(sameMode)$$('.nf-scroller',host).forEach((el,i)=>{el.scrollLeft=positions[i]||0;});
}

const postLabels={general:'자유 이야기',showcase:'작품 소개',buildlog:'개발 일지',question:'질문',feedback:'피드백'};
function postTile(p){return `<a class="nf-tile nf-post-tile" href="/posts/${encodeURIComponent(p.id)}"><span class="nf-tile-kicker">${escapeHtml(postLabels[p.category]||'이야기')}</span><strong>${escapeHtml(p.title)}</strong><p>${escapeHtml(p.body.slice(0,90))}</p><span class="nf-tile-meta">${escapeHtml(p.author_name)} · ♡ ${Number(p.recommendations)} · 댓글 ${Number(p.comments)}</span></a>`;}
// ───── Continue watching: works opened on this device, newest first (localStorage, never sent anywhere) ─────
const RECENT_KEY='vibeflix.recent';
function readRecent(){try{const v=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(v)?v.filter(x=>x&&typeof x.id==='string'):[];}catch{return [];}}
function rememberWork(id){try{const list=readRecent().filter(x=>x.id!==id);const prev=readRecent().find(x=>x.id===id)||{};list.unshift({...prev,id,at:Date.now()});localStorage.setItem(RECENT_KEY,JSON.stringify(list.slice(0,20)));}catch{}}
function recentWorks(){return readRecent().map(r=>{const p=findProject(r.id);return p&&!p.draft?{...p,_resume:r}:null;}).filter(Boolean).slice(0,12);}
function recentTile(p){
  const r=p._resume||{};const href=r.entry?`/works/${encodeURIComponent(p.id)}/e/${encodeURIComponent(r.entry)}`:'';
  return `<div class="nf-recent">${cardMarkup(p)}${href?`<a class="nf-continue" href="${escapeHtml(href)}"><span aria-hidden="true">▶</span> 이어 보기${r.label?` · ${escapeHtml(r.label)}`:''}</a>`:`<a class="nf-continue quiet" href="/works/${encodeURIComponent(p.id)}">작품 페이지 ›</a>`}</div>`;
}
document.addEventListener('click',event=>{if(!event.target.closest('[data-clear-recent]'))return;try{localStorage.removeItem(RECENT_KEY);}catch{}renderRows(rowsMode);toast('이어서 볼 작품 기록을 지웠어요.');});
// ───── Fans: what the creators I follow published lately (episodes, updates, new works) ─────
let feedItems=[];
function feedTile(f){
  const href=f.entry_id?`/works/${encodeURIComponent(f.project_id)}/e/${encodeURIComponent(f.entry_id)}`:`/works/${encodeURIComponent(f.project_id)}`;
  const label=f.kind==='work'?'새 작품':f.kind==='episode'?`${f.number}화`:f.version?`v${String(f.version).replace(/^v/i,'')}`:'업데이트';
  const when=Math.max(0,Math.round((Date.now()-Number(f.at))/86400000));
  return `<a class="nf-tile nf-feed-tile" href="${escapeHtml(href)}"${imageUrl(f.image)?` style="--bg:url('${escapeHtml(imageUrl(f.image))}')"`:''}><span class="nf-tile-kicker">${escapeHtml(f.creator)} · ${escapeHtml(label)}</span><strong>${escapeHtml(f.kind==='work'?f.title:`${f.work_title} · ${f.title}`)}</strong><span class="nf-tile-meta">${when?`${when}일 전`:'오늘'} · ${escapeHtml(typeNames[f.type]||'')}</span></a>`;
}
async function loadFeed(){
  if(!user){if(feedItems.length){feedItems=[];if(rowsMode==='home')renderRows('home');}return;}
  try{const r=await fetch('/api/community/feed');if(!r.ok)return;const d=await r.json();feedItems=Array.isArray(d.items)?d.items:[];if(rowsMode==='home')renderRows('home');}catch{}
}
document.addEventListener('vibe:auth',loadFeed);
// Searches that found nothing tell the operator what visitors want but can't find (query text only, no account).
const reportedMisses=new Set();let missTimer;
function reportSearchMiss(q){
  clearTimeout(missTimer);if(!catalogComplete||q.length<2||reportedMisses.has(q))return;
  missTimer=setTimeout(()=>{if(query!==q||reportedMisses.has(q))return;reportedMisses.add(q);fetch('/api/community/search-miss',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q}),keepalive:true}).catch(()=>{});},1500);
}
function emptyTile(r){return r.community?'<div class="nf-tile nf-empty-tile"><strong>첫 번째 이야기를 들려주세요.</strong><p>만드는 과정도, 작은 질문도 좋은 이야기의 시작이에요.</p><button class="secondary-button" data-compose-post>＋ 이야기 쓰기</button></div>':`<div class="nf-tile nf-empty-tile"><strong>아직 올라온 ${typeNames[r.type]} 작품이 없어요.</strong><p>첫 번째 작품의 주인공이 되어보세요.</p><button class="secondary-button" data-upload-empty>＋ 작품 올리기</button></div>`;}
// community.js shares the newest posts so the home row stays in sync with the board
document.addEventListener('vibe:posts',event=>{homePosts=event.detail;if(rowsMode==='home')renderRows('home');if(document.body.classList.contains('community-view'))renderCommunityRows();});
function setCommunityView(on){document.body.classList.toggle('community-view',on);$('#community-nav').classList.toggle('active',on);if(!on&&location.hash==='#community')history.replaceState(null,'',location.pathname+location.search);if(on){history.replaceState(null,'','#community');$$('[data-nav]').forEach(b=>b.classList.remove('active'));window.scrollTo({top:0});renderCommunityRows();}}
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
  const upcoming=findProject(id)?.status==='upcoming';
  if(saved.has(id)){saved.delete(id);toast(upcoming?'출시 알림을 취소했어요.':'찜한 작품에서 삭제했어요.');}
  else{saved.add(id);toast(upcoming?(user?'공개되면 알림으로 알려드릴게요.':'찜했어요. 로그인하면 공개될 때 알림을 받을 수 있어요.'):'나만의 바이브 컬렉션에 추가했어요.');}
  if(!user)try{localStorage.setItem('vibeflix.saved.v2',JSON.stringify([...saved]));}catch{toast('브라우저 저장 공간이 없어 이번 방문에서만 유지됩니다.');}
  const position=$('#project-row').scrollLeft;render();$('#project-row').scrollLeft=position;
  if(detailId===id&&$('#detail-dialog').open){$('#detail-save').textContent=saveLabel(findProject(id),saved.has(id));$('#detail-save').setAttribute('aria-pressed',String(saved.has(id)));}
}
function updateHeroSave(){const state=saved.has(currentFeatured);$('#hero-save').classList.toggle('saved',state);$('#hero-save').textContent=state?'✓':'＋';$('#hero-save').setAttribute('aria-pressed',String(state));$('#hero-save').setAttribute('aria-label',`${findProject(currentFeatured)?.title||'작품'} ${state?'찜 취소':'찜하기'}`);}
const sampleCta={novel:'예시 1화 읽기 →',art:'예시 작품 보기 →',video:'▶ 예시 영상 보기'};
/** Install and making facts in the preview: platforms, price, store links, tech stack, AI tools, team. */
function detailFacts(p){
  const d=p.details||{};const out=[];const chip=list=>list.map(x=>`<span>${escapeHtml(x)}</span>`).join('');
  if(p.type==='app'){
    const platforms=(d.platforms||[]).map(x=>({ios:'iOS',android:'Android',web:'웹'}[x]||x));const price={free:'무료',paid:'유료',iap:'무료 · 앱 내 결제'}[d.price];
    const stores=[[d.appStore,'App Store'],[d.playStore,'Google Play']].filter(([u])=>validUrl(u)).map(([u,l])=>`<a class="store-link" href="${escapeHtml(validUrl(u))}" target="_blank" rel="noopener noreferrer"${guardAttr(p)}>${l} ↗</a>`).join('');
    if(platforms.length||price||stores)out.push(`<div class="fact"><b>설치</b><div class="fact-chips">${chip(platforms)}${price?`<span>${price}</span>`:''}${stores}</div></div>`);
  }
  if(p.type==='game'&&(d.playMode||d.playtime))out.push(`<div class="fact"><b>플레이</b><div class="fact-chips">${d.playMode?`<span>${{browser:'브라우저에서 바로',download:'다운로드 설치',mobile:'모바일'}[d.playMode]}</span>`:''}${d.playtime?`<span>${escapeHtml(d.playtime)}</span>`:''}</div></div>`);
  if((d.stack||[]).length)out.push(`<div class="fact"><b>사용 기술</b><div class="fact-chips">${chip(d.stack.slice(0,6))}</div></div>`);
  if((d.making?.tools||[]).length)out.push(`<div class="fact"><b>만든 AI 도구</b><div class="fact-chips">${chip(d.making.tools.slice(0,6))}${d.making.days?`<span>제작 ${escapeHtml(d.making.days)}</span>`:''}</div></div>`);
  if((d.team||[]).length)out.push(`<div class="fact"><b>함께 만든 사람</b><div class="fact-chips">${chip(d.team.slice(0,6))}</div></div>`);
  if((d.warnings||[]).includes('mature'))out.push('<p class="fact-warning">성인 소재가 포함된 작품이에요. 상세 페이지에서 확인 후 볼 수 있어요.</p>');
  return out.length?`<div class="detail-facts">${out.join('')}</div>`:'';
}
// apps without a web link still have somewhere to go: their store page
const storeLink=p=>p.type!=='app'||p.status==='upcoming'?null:validUrl(p.details?.appStore)?[validUrl(p.details.appStore),'App Store']:validUrl(p.details?.playStore)?[validUrl(p.details.playStore),'Google Play']:null;
const saveLabel=(p,on)=>p?.status==='upcoming'?(on?'✓ 출시 알림 신청함':'＋ 출시 알림 받기'):(on?'✓ 찜했어요':'＋ 찜하기');
// Community links an operator has not checked yet get a "you are leaving VIBEFLIX" confirmation (public/leave-guard.js)
const guardAttr=p=>p.verified?'':' data-leave-guard';
function openDetail(id){
  hit(id,'view');
  const p=findProject(id);if(!p)return;detailId=id;if(!p.draft)rememberWork(id);
  const url=validUrl(p.url);
  $('#detail-content').innerHTML=`<div class="detail-cover">${artMarkup(p)}</div><div class="detail-body"><div class="detail-overline"><span class="type-label">${typeNames[p.type]}</span><span>${p.sample?'SAMPLE · 예시 작품':p.status==='upcoming'?'IN DEVELOPMENT':p.badge==='COMMUNITY'?'COMMUNITY PROJECT':'MADE BY DEEPCHOI'}</span>${p.badge==='COMMUNITY'&&p.verified&&url?'<span class="verified-chip" title="운영자가 링크를 확인했어요">✓ 운영자 확인</span>':''}</div><h2 id="detail-title">${escapeHtml(p.title)}</h2><p class="detail-subtitle">${escapeHtml(p.subtitle)}</p><p class="detail-description">${escapeHtml(p.description)}</p>${(p.gallery||[]).length?`<div class="detail-gallery">${p.gallery.filter(imageUrl).map((src,i)=>`<img src="${escapeHtml(imageUrl(src))}" alt="${escapeHtml(p.title)} 소개 이미지 ${i+1}" loading="lazy">`).join('')}</div>`:''}${detailFacts(p)}<div class="detail-creator"><span class="creator-dot">${escapeHtml((p.creator||'V')[0].toUpperCase())}</span>Created by ${p.creatorId?`<a class="detail-creator-link" href="/creators/${encodeURIComponent(p.creatorId)}">${escapeHtml(p.creator)}</a>`:escapeHtml(p.creator)}</div><div class="detail-tags">${(p.tags||[]).map(t=>`<span>#${escapeHtml(t)}</span>`).join('')}</div><div class="detail-actions">${p.sample?`<a class="primary-button" href="/works/${encodeURIComponent(p.id)}">${sampleCta[p.type]||'예시 보기'}</a>`:url?`<a class="primary-button" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"${guardAttr(p)}>${ctaLabels[p.type]||'서비스 바로가기 ↗'}</a>`:storeLink(p)?`<a class="primary-button" href="${escapeHtml(storeLink(p)[0])}" target="_blank" rel="noopener noreferrer"${guardAttr(p)}>${storeLink(p)[1]}에서 받기 ↗</a>`:'<button class="primary-button" disabled>공개 준비 중</button>'}${p.sample?'':`<a class="secondary-button" href="/works/${encodeURIComponent(p.id)}">상세 페이지 →</a>`}<button class="secondary-button" id="detail-save" aria-pressed="${saved.has(id)}">${saveLabel(p,saved.has(id))}</button></div>${p.sample?'':`<a class="detail-reviews" id="detail-reviews" href="/works/${encodeURIComponent(p.id)}#discussion"><span>${p.ratingCount?`★ ${Number(p.rating).toFixed(1)} · ${p.ratingCount}명`:'아직 평가가 없어요'}${p.commentCount?` · 댓글 ${p.commentCount}`:''}</span><b>별점 · 리뷰 · 댓글 →</b></a>`}<p class="detail-notice">${p.sample?'화면 구성을 보여주기 위해 운영자가 만든 예시 작품이에요. 사이트 안의 예시 페이지에서 볼 수 있어요.':url||storeLink(p)?(p.verified?'작품 페이지가 새 탭에서 열립니다. 서비스별로 별도 로그인이 필요할 수 있어요.':'VIBEFLIX 밖의 사이트가 새 탭에서 열려요. 회원이 올린 링크로, 운영자가 아직 확인하지 않았어요.'):p.status==='upcoming'?'아직 공개 전이에요. 출시 알림을 받으면 공개되는 날 알려드릴게요.':'아직 공개 플레이 링크가 준비되지 않았습니다. 정식 공개를 기다려주세요.'}</p>${p.owned?`<a class="text-button detail-edit" href="/works/${encodeURIComponent(p.id)}/edit">작품 수정</a>`:''}</div>`;
  $('#detail-dialog').setAttribute('aria-labelledby','detail-title');$('#detail-save').addEventListener('click',()=>toggleSave(id));
  $('#detail-dialog').showModal();
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
async function loadSession(){
  try{const response=await fetch('/api/session');if(!response.ok)throw Error('로그인 확인 실패');const data=await response.json();user=data.user;}catch{user=null;}
  $('#sign-in').hidden=!!user;$('#profile-button').hidden=!user;$('#sign-out').hidden=!user;$('#admin-link').hidden=!user?.isAdmin;$('#studio-link').hidden=!user;
  if(user){$('#profile-button').textContent=user.name[0].toUpperCase();$('#profile-button').title=`${user.name} · 찜한 작품`;}
  document.dispatchEvent(new CustomEvent('vibe:auth',{detail:user}));
}
const sessionReady=loadSession();
// Writing happens on its own pages: /works/new and /works/:id/edit (public/work-editor.js)
async function openUpload(editId){await sessionReady;const edit=typeof editId==='string'?editId:'';if(!edit&&!user){window.VibeCommunity?.login('upload');return;}location.href=edit?`/works/${encodeURIComponent(edit)}/edit`:'/works/new';}
$('#upload-open').addEventListener('click',openUpload);$('#banner-upload').addEventListener('click',openUpload);
// [data-close] buttons and backdrop clicks are handled by public/ds.js (with the unsaved-input guard)
$('#about-button').addEventListener('click',()=>$('#about-dialog').showModal());
document.addEventListener('keydown',event=>{if(event.key==='/'&&!$('dialog[open]')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){event.preventDefault();openSearch();}});
// Operator settings from /admin: a notice strip and the pinned order of the highlight row
function applySite(site){
  pinnedIds=Array.isArray(site?.pinned)?site.pinned:[];
  const notice=$('#site-notice');const text=site?.notice||'';notice.hidden=!text;
  notice.innerHTML=text?(site.noticeUrl?`<a href="${escapeHtml(site.noticeUrl)}"${/^https?:/.test(site.noticeUrl)?' target="_blank" rel="noopener noreferrer"':''}>${escapeHtml(text)} <span aria-hidden="true">→</span></a>`:`<span>${escapeHtml(text)}</span>`):'';
  document.body.classList.toggle('has-notice',!!text);
}
// The catalog arrives in pages (no fixed cap): the first page renders at once, the rest stream in behind it.
let catalogGeneration=0;
async function loadCatalog(){
  let message='';const generation=++catalogGeneration;catalogComplete=false;
  try{
    const response=await fetch('/api/projects');const result=await response.json();if(!Array.isArray(result.projects))throw Error('잘못된 응답');
    myDrafts=result.projects.filter(p=>p.draft);projects=result.projects.filter(p=>!p.draft);message=result.error||'';applySite(result.site);
    if(result.genres)genreMap=result.genres;collections=Array.isArray(result.collections)?result.collections:[];
    if(Array.isArray(result.banners)&&result.banners.length)homeBanners=result.banners;heroKey='';
    loadRemainingPages(result.next,generation);
  }
  catch{try{const response=await fetch('/catalog.json');if(!response.ok)throw Error();projects=await response.json();message='커뮤니티 작품을 불러오지 못했습니다. 기본 서비스는 계속 이용할 수 있어요.';}catch{message='작품을 불러올 수 없습니다. 연결을 확인한 뒤 새로고침해주세요.';}catalogComplete=true;}
  $('#catalog-status').hidden=!message;$('#catalog-status').textContent=message;render();
  // /#work=ID opens that work's panel; /#edit=ID is the old address of the edit page
  const [,hashKind,hashId]=location.hash.match(/^#(work|edit)=(.+)$/)||[];const linked=decodeURIComponent(hashId||'');
  if(hashKind==='edit'){location.replace(`/works/${encodeURIComponent(linked)}/edit`);return;}
  if(linked&&findProject(linked)){history.replaceState(null,'',location.pathname+location.search);openDetail(linked);}
  if(location.hash==='#profile'){history.replaceState(null,'',location.pathname+location.search);sessionReady.then(()=>user?window.VibeCommunity?.openProfile():window.VibeCommunity?.login());}
  document.dispatchEvent(new CustomEvent('vibe:catalog'));
}
async function loadRemainingPages(next,generation){
  try{
    while(next!=null&&generation===catalogGeneration){
      const response=await fetch(`/api/projects?offset=${encodeURIComponent(next)}`);const result=await response.json();
      if(generation!==catalogGeneration||!Array.isArray(result.projects))return;
      const known=new Set([...projects,...myDrafts].map(p=>p.id));const fresh=result.projects.filter(p=>!known.has(p.id));
      myDrafts.push(...fresh.filter(p=>p.draft));projects.push(...fresh.filter(p=>!p.draft));next=result.next;
      const position=$('#project-row').scrollLeft;render();$('#project-row').scrollLeft=position;
    }
  }catch{}
  if(generation===catalogGeneration){catalogComplete=true;if(query)render();document.dispatchEvent(new CustomEvent('vibe:catalog'));}
}
loadCatalog();
if(location.hash==='#community')setCommunityView(true);
// a message from the page we just came from (public/social.js flash)
try{const message=sessionStorage.getItem('vibeflix.flash');if(message){sessionStorage.removeItem('vibeflix.flash');toast(message);}}catch{}
window.Vibe={sessionReady,getUser:()=>user,getProjects:()=>projects,getSaved:()=>[...saved],setSaved:ids=>{saved=new Set(ids);render();},refreshAuth:loadSession,reload:loadCatalog,openDetail,openUpload,render,artMarkup,toast,escapeHtml,setFilter,setCommunityView,patchProject:(id,patch)=>{const p=findProject(id);if(p)Object.assign(p,patch);render();}};

// Signing in from a work or creator page: /?login=1&next=/works/… returns there once the session exists.
{
  const params=new URLSearchParams(location.search);const next=params.get('next')||'';
  const safeNext=/^\/(works|creators|posts|studio)\/[^/]|^\/(account|studio)(#|$)/.test(next)?next:'';
  if(params.get('login')==='1'){
    sessionReady.then(()=>{if(user){if(safeNext)location.href=safeNext;}else window.VibeCommunity?.login();});
    document.addEventListener('vibe:auth',event=>{if(event.detail&&safeNext)location.href=safeNext;});
  }
}
// Creator stats: a panel opened counts as a view, an outbound link from the panel or the hero as a click.
const counted=new Set();
function hit(id,kind){if(!id||findProject(id)?.draft)return;if(kind==='view'){if(counted.has(id))return;counted.add(id);}fetch(`/api/projects/${encodeURIComponent(id)}/hit?kind=${kind}`,{method:'POST',keepalive:true}).catch(()=>{});}
document.addEventListener('click',event=>{
  const link=event.target.closest('#detail-content .detail-actions a[target="_blank"]');if(link)hit(detailId,'click');
  if(event.target.closest('#hero-play[target="_blank"]'))hit(currentFeatured,'click');
});
// a guarded link counts once the visitor confirms leaving (public/leave-guard.js)
document.addEventListener('vibe:leave',event=>{if(event.detail?.closest?.('#detail-content')){hit(detailId,'click');leftFrom=detailId;leftAt=Date.now();}});
// Players and app users come back to the tab after trying the work: point them at the rating while it's fresh
let leftAt=0,leftFrom='';
document.addEventListener('click',event=>{if(event.target.closest('#detail-content .detail-actions a[target="_blank"]:not([data-leave-guard])')){leftFrom=detailId;leftAt=Date.now();}});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible'||!leftAt||Date.now()-leftAt<20000)return;
  const id=leftFrom;leftAt=0;const p=findProject(id);
  if(!p||p.myRating||p.owned||!$('#detail-dialog').open||detailId!==id)return;
  const section=$('#detail-reviews');if(!section)return;
  section.classList.add('rate-nudge');section.scrollIntoView({behavior:'smooth',block:'center'});
  toast(p.type==='game'?'플레이해보니 어땠나요? 별점과 한 줄 리뷰를 남겨주세요.':'써보니 어땠나요? 별점과 한 줄 리뷰를 남겨주세요.');
});

// Website page: browse by tech stack (chips search the catalog for that technology)
function stackChips(){
  const counts=new Map();for(const p of projects)if(p.type==='website')for(const t of p.details?.stack||[])counts.set(t,(counts.get(t)||0)+1);
  const top=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,12);
  return top.length?`<nav class="nf-cat-chips nf-stack-chips" aria-label="사용 기술로 찾기"><span>사용 기술</span>${top.map(([t,n])=>`<button data-stack="${escapeHtml(t)}">${escapeHtml(t)}<span>${n}</span></button>`).join('')}</nav>`:'';
}
document.addEventListener('click',event=>{const chip=event.target.closest('[data-stack]');if(!chip)return;openSearch();const input=$('#search');input.value=chip.dataset.stack;input.dispatchEvent(new Event('input'));});
