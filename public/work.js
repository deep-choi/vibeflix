'use strict';
// Behaviour for the server-rendered work, episode and creator pages: follow, save, recommend, share,
// ratings and comments (public/social.js), in-page play, reading position and click stats.
(function(){
  const {$,$$,esc,time,toast,api,needLogin}=window.Social;
  const cfg=JSON.parse($('#work-config')?.textContent||'{}');
  window.Social.setMember(cfg.loggedIn);
  const workApi=p=>`/api/projects/${encodeURIComponent(cfg.id)}${p||''}`;

  /* ───── Follow (work and creator pages) ───── */
  $$('[data-follow]').forEach(button=>button.addEventListener('click',async()=>{
    if(needLogin())return;button.disabled=true;
    try{const r=await api(`/api/follows/${encodeURIComponent(cfg.creatorId)}`,'PUT',{active:!cfg.following});cfg.following=r.following;button.classList.toggle('on',r.following);button.textContent=r.following?'팔로잉':'＋ 팔로우';const count=$('[data-follower-count]');if(count)count.textContent=r.followers;toast(r.following?'팔로우했어요. 새 회차와 소식을 알려드릴게요.':'팔로우를 취소했어요.');}
    catch(error){if(error.message!=='consent')toast(error.message);}finally{button.disabled=false;}
  }));
  if(cfg.creatorPage)return;

  /* ───── Remember this work for the home page's "이어서 볼 작품" row (this device only) ───── */
  try{const key='vibeflix.recent';const list=JSON.parse(localStorage.getItem(key)||'[]').filter(x=>x&&x.id!==cfg.id);const prev=JSON.parse(localStorage.getItem(key)||'[]').find(x=>x&&x.id===cfg.id)||{};list.unshift({...prev,id:cfg.id,at:Date.now()});localStorage.setItem(key,JSON.stringify(list.slice(0,20)));}catch{}

  /* ───── Save, recommend, share ───── */
  $('[data-save]')?.addEventListener('click',async event=>{
    const b=event.currentTarget;if(needLogin())return;b.disabled=true;
    try{await api('/api/community/bookmarks','PUT',{projectId:cfg.id,active:!cfg.saved});cfg.saved=!cfg.saved;b.classList.toggle('on',cfg.saved);
      if(cfg.upcoming){b.textContent=cfg.saved?'✓ 출시 알림 신청함':'＋ 출시 알림 받기';toast(cfg.saved?'공개되면 알림으로 알려드릴게요.':'출시 알림을 취소했어요.');}
      else{b.textContent=cfg.saved?'✓ 찜했어요':'＋ 찜하기';toast(cfg.saved?'찜했어요. 새 회차와 업데이트를 알려드릴게요.':'찜을 취소했어요.');}}
    catch(error){toast(error.message);}finally{b.disabled=false;}
  });
  $('[data-recommend]')?.addEventListener('click',async event=>{
    const b=event.currentTarget;if(needLogin())return;b.disabled=true;
    try{const s=await api('/api/community/react','PUT',{kind:'project',targetId:cfg.id,active:!cfg.recommended});cfg.recommended=s.recommended;b.classList.toggle('on',s.recommended);$('[data-recommend-count]',b).textContent=s.recommendations||'';}
    catch(error){toast(error.message);}finally{b.disabled=false;}
  });
  $('[data-share]')?.addEventListener('click',async()=>{
    const url=location.origin+location.pathname;
    try{if(navigator.share)await navigator.share({title:cfg.title,url});else{await navigator.clipboard.writeText(url);toast('링크를 복사했어요.');}}catch{}
  });

  /* ───── Click stats: outbound links on this page ───── */
  const countClick=()=>fetch(workApi('/hit?kind=click'),{method:'POST',keepalive:true}).catch(()=>{});
  document.addEventListener('click',event=>{if(event.target.closest('[data-track-click]'))countClick();});
  // guarded links (public/leave-guard.js) count once the visitor confirms leaving
  document.addEventListener('vibe:leave',event=>{if(event.detail?.closest?.('[data-track-click]'))countClick();});

  /* ───── 성인 소재: blurred until the visitor opts in (remembered for this visit) ───── */
  if(cfg.mature){
    const okKey='vibeflix.mature-ok';const seen=()=>{try{return JSON.parse(sessionStorage.getItem(okKey)||'[]');}catch{return [];}};
    const open=()=>{$('main')?.classList.remove('is-gated');$('.mature-gate')?.remove();};
    if(seen().includes(cfg.id))open();
    $('[data-mature-ok]')?.addEventListener('click',()=>{try{sessionStorage.setItem(okKey,JSON.stringify([...seen(),cfg.id]));}catch{}open();});
  }

  /* ───── Video chapters jump the player to that moment ───── */
  document.addEventListener('click',event=>{
    const b=event.target.closest('[data-seek]');if(!b)return;const frame=$('.frame iframe');if(!frame){toast('영상을 재생할 수 없어요.');return;}
    const t=Number(b.dataset.seek)||0;const url=new URL(frame.src);
    if(url.hostname.includes('vimeo')){url.searchParams.set('autoplay','1');url.hash=`t=${t}s`;}else{url.searchParams.set('start',String(t));url.searchParams.set('autoplay','1');}
    frame.src=url.href;frame.closest('.frame')?.scrollIntoView({behavior:'smooth',block:'center'});
  });

  /* ───── Back from playing/using it? Ask for a rating while the experience is fresh ───── */
  let leftAt=0;
  const markLeft=()=>{leftAt=Date.now();};
  document.addEventListener('click',event=>{if(event.target.closest('[data-track-click]:not([data-leave-guard])'))markLeft();});
  document.addEventListener('vibe:leave',markLeft);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible'||!leftAt||Date.now()-leftAt<20000||!cfg.canRate||cfg.myRating||$('.after-play'))return;
    leftAt=0;const bar=document.createElement('div');bar.className='after-play';bar.setAttribute('role','status');
    bar.innerHTML=`<span><b>${cfg.type==='game'?'플레이해보니 어땠나요?':'써보니 어땠나요?'}</b> 별점과 한 줄 리뷰가 다음 사람에게 큰 도움이 돼요.</span><button class="btn small primary" data-rate-now>별점 남기기</button><button class="close" aria-label="닫기">✕</button>`;
    document.body.append(bar);
    bar.querySelector('.close').addEventListener('click',()=>bar.remove());
    bar.querySelector('[data-rate-now]').addEventListener('click',()=>{bar.remove();$('#discussion')?.scrollIntoView({behavior:'smooth'});setTimeout(()=>$('#rating-box [data-star="5"]')?.focus(),500);});
  });

  /* ───── In-page play (itch.io HTML5 embed) ───── */
  $('[data-play-embed]')?.addEventListener('click',()=>{
    const box=$('#play-embed');if(!box)return;
    if(!box.firstChild)box.innerHTML=`<iframe src="${esc(box.dataset.src)}" title="${esc(cfg.title)} 플레이" allow="autoplay; fullscreen; gamepad" allowfullscreen></iframe>`;
    box.hidden=false;box.scrollIntoView({behavior:'smooth',block:'center'});
  });

  /* ───── Continue reading/watching where you left off ───── */
  try{
    const last=localStorage.getItem('vibeflix.read.'+cfg.id);const link=last&&$(`[data-entry="${CSS.escape(last)}"]`);const button=$('[data-continue-latest]');
    if(link&&button){button.href=link.getAttribute('href');button.textContent=`이어 보기 · ${link.querySelector('b').textContent}`;button.hidden=false;}
  }catch{}

  /* ───── App screenshots: portrait images sit in a phone frame ───── */
  $$('.body.phones img').forEach(img=>{const mark=()=>{if(img.naturalHeight>img.naturalWidth*1.3)img.classList.add('portrait');};img.complete?mark():img.addEventListener('load',mark);});

  /* ───── Ratings and reviews ───── */
  const box=$('#rating-box');let nextReview=null;
  function ratingForm(){
    if(!box)return;
    if(cfg.owner){box.innerHTML='<p class="muted">내 작품에는 별점을 남길 수 없어요. 받은 평가는 아래에서 볼 수 있어요.</p>';return;}
    if(!cfg.canRate){box.innerHTML='<p class="muted">공개된 작품만 평가할 수 있어요.</p>';return;}
    box.innerHTML=`<form class="rating-form"><div class="stars" role="radiogroup" aria-label="별점">${[1,2,3,4,5].map(n=>`<button type="button" role="radio" aria-checked="${n===cfg.myRating}" aria-label="${n}점" data-star="${n}" class="${n<=cfg.myRating?'on':''}">★</button>`).join('')}</div><input name="review" maxlength="1000" placeholder="${cfg.loggedIn?'한 줄 리뷰 (선택)':'로그인하면 별점을 남길 수 있어요.'}" value="${esc(cfg.myReview)}"><button class="btn small primary">${cfg.myRating?'수정':'남기기'}</button>${cfg.myRating?'<button type="button" class="btn small" data-rating-delete>삭제</button>':''}</form>`;
    let score=cfg.myRating;const form=$('form',box);
    $$('[data-star]',form).forEach(star=>star.addEventListener('click',()=>{score=Number(star.dataset.star);$$('[data-star]',form).forEach(s=>{const n=Number(s.dataset.star);s.classList.toggle('on',n<=score);s.setAttribute('aria-checked',String(n===score));});}));
    form.addEventListener('submit',async event=>{event.preventDefault();if(needLogin())return;if(!score){toast('별점을 골라주세요.');return;}
      try{const s=await api(`/api/community/ratings/${encodeURIComponent(cfg.id)}`,'PUT',{score,review:form.review.value.trim()});cfg.myRating=s.myRating;cfg.myReview=s.myReview||'';summary(s);toast('별점을 남겼어요.');ratingForm();loadReviews();}catch(error){if(error.message!=='consent')toast(error.message);}});
    $('[data-rating-delete]',form)?.addEventListener('click',async()=>{try{const s=await api(`/api/community/ratings/${encodeURIComponent(cfg.id)}`,'DELETE');cfg.myRating=0;cfg.myReview='';summary(s);ratingForm();loadReviews();}catch(error){toast(error.message);}});
  }
  const summary=s=>{const el=$('[data-rating-summary]');if(el)el.textContent=s.ratingCount?`★ ${Number(s.rating).toFixed(1)} · ${s.ratingCount}명`:'첫 평가를 기다려요';};
  async function loadReviews(){
    const list=$('#reviews');if(!list||!(cfg.canRate||cfg.owner))return;
    try{const r=await api(`/api/community/ratings/${encodeURIComponent(cfg.id)}`);const rows=r.reviews.filter(x=>x.review);nextReview=r.next;
      // how the scores spread, so one 5★ doesn't read like a consensus
      const total=(r.distribution||[]).reduce((n,x)=>n+x,0);const top=Math.max(1,...(r.distribution||[0]));
      const dist=total>=2?`<ul class="dist" aria-label="별점 분포">${[5,4,3,2,1].map(n=>`<li><span>${n}★</span><i style="--w:${Math.round((r.distribution[n-1]/top)*100)}%"></i><em>${r.distribution[n-1]}</em></li>`).join('')}</ul>`:'';
      list.innerHTML=dist+(rows.length?`<ul class="reviews">${rows.map(reviewItem).join('')}</ul>`:'')+(nextReview===null?'':'<button type="button" class="link" data-reviews-more>평가 더 보기 ↓</button>');}catch{}
  }
  const reviewItem=x=>`<li><span class="stars-read">${'★'.repeat(x.score)}${'☆'.repeat(5-x.score)}</span><p>${esc(x.review)}</p><small>${esc(x.author_name)} · ${time(x.updated)}</small>${cfg.loggedIn&&!x.owned?`<div class="comment-actions"><button type="button" class="link" data-report-review-user="${esc(x.author_id)}">작성자 신고</button><button type="button" class="link" data-block-review-user="${esc(x.author_id)}">작성자 차단</button></div>`:''}</li>`;
  $('#reviews')?.addEventListener('click',async event=>{
    const button=event.target.closest('[data-reviews-more]');if(!button)return;button.disabled=true;
    try{const r=await api(`/api/community/ratings/${encodeURIComponent(cfg.id)}?offset=${nextReview}`);nextReview=r.next;let ul=$('#reviews .reviews');if(!ul){button.insertAdjacentHTML('beforebegin','<ul class="reviews"></ul>');ul=$('#reviews .reviews');}ul.insertAdjacentHTML('beforeend',r.reviews.filter(x=>x.review).map(reviewItem).join(''));if(nextReview===null)button.remove();else button.disabled=false;}
    catch(error){toast(error.message);button.disabled=false;}
  });

  /* ───── Comments (with feedback / bug report labels on apps, games and websites) ───── */
  window.Social.discussion($('#comments'),{kind:'project',id:cfg.id,workId:cfg.id,labels:cfg.labels,owner:cfg.owner,updates:cfg.updates||[],placeholder:cfg.loggedIn?'이 작품에 대한 이야기를 남겨주세요.':'로그인하면 댓글을 남길 수 있어요.'});

  /* ───── Owner: edit links next to each episode ───── */
  if(cfg.owner)$$('[data-entry]').forEach(a=>{const edit=document.createElement('a');edit.className='link entry-edit';edit.textContent='수정';edit.href=`${a.getAttribute('href')}/edit`;a.parentElement.append(edit);});

  /* ───── After a first work goes live: offer a ready-made 피드백 요청 post ───── */
  try{
    if(sessionStorage.getItem('vibeflix.ask-feedback')===cfg.id){
      sessionStorage.removeItem('vibeflix.ask-feedback');
      setTimeout(async()=>{if(await window.DS.confirm({title:'첫 작품을 올렸어요! 피드백을 받아볼까요?',message:'커뮤니티에 ‘피드백 요청’ 글을 쓰면 다른 바이브 코더들이 써보고 의견을 남겨줘요. 글은 미리 채워둘게요.',confirmLabel:'피드백 요청 글 쓰기',cancelLabel:'나중에'}))location.href=`/posts/new?feedback=${encodeURIComponent(cfg.id)}`;},900);
    }
  }catch{}

  ratingForm();loadReviews();
})();
