'use strict';
// Behaviour for the server-rendered work, episode and creator pages: follow, save, recommend, share,
// ratings and comments, the owner's episode/update editor, in-page play, reading position and click stats.
(function(){
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cfg=JSON.parse($('#work-config')?.textContent||'{}');
  const time=t=>{const d=Math.round((Date.now()-Number(t))/60000);return d<1?'방금':d<60?`${d}분 전`:d<1440?`${Math.round(d/60)}시간 전`:new Date(Number(t)).toLocaleDateString('ko-KR');};
  let toastTimer;
  function toast(message){let t=$('.work-toast');if(!t){t=document.createElement('div');t.className='work-toast';t.setAttribute('role','status');document.body.append(t);}t.textContent=message;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},2600);}
  const loginUrl=()=>`/?login=1&next=${encodeURIComponent(location.pathname+location.hash)}`;
  /** JSON call to the site API; sends people to sign in on 401 and explains other failures. */
  async function api(path,method='GET',payload){
    const response=await fetch(path,{method,headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined});
    const data=await response.json().catch(()=>({}));
    if(response.status===401){location.href=loginUrl();throw Error('로그인이 필요해요.');}
    if(response.status===428){toast(data.error||'내 프로필에서 이용약관에 동의한 뒤 작성해주세요.');throw Error('consent');}
    if(!response.ok)throw Error(data.error||'요청을 처리하지 못했어요.');
    return data;
  }
  const needLogin=()=>{if(cfg.loggedIn)return false;location.href=loginUrl();return true;};
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
  const box=$('#rating-box');
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
    try{const r=await api(`/api/community/ratings/${encodeURIComponent(cfg.id)}`);const rows=r.reviews.filter(x=>x.review);
      // how the scores spread, so one 5★ doesn't read like a consensus
      const total=(r.distribution||[]).reduce((n,x)=>n+x,0);const top=Math.max(1,...(r.distribution||[0]));
      const dist=total>=2?`<ul class="dist" aria-label="별점 분포">${[5,4,3,2,1].map(n=>`<li><span>${n}★</span><i style="--w:${Math.round((r.distribution[n-1]/top)*100)}%"></i><em>${r.distribution[n-1]}</em></li>`).join('')}</ul>`:'';
      list.innerHTML=dist+(rows.length?`<ul class="reviews">${rows.map(x=>`<li><span class="stars-read">${'★'.repeat(x.score)}${'☆'.repeat(5-x.score)}</span><p>${esc(x.review)}</p><small>${esc(x.author_name)} · ${time(x.updated)}</small></li>`).join('')}</ul>`:'');}catch{}
  }

  /* ───── Comments (with feedback / bug report labels on apps, games and websites) ───── */
  let comments=[],filter='';
  const labelName={feedback:'피드백',bug:'버그 제보'};
  function drawComments(){
    const list=$('#comments');if(!list)return;
    const top=comments.filter(c=>!c.parent_id&&(!filter||c.label===filter));const replies=id=>comments.filter(c=>c.parent_id===id);
    const item=(c,reply)=>`<li class="comment${reply?' reply':''}" data-comment="${esc(c.id)}"><div class="comment-head"><b>${esc(c.author_name)}</b>${c.label?`<em class="chip label-${esc(c.label)}">${labelName[c.label]||''}</em>`:''}${statusChip(c)}<small>${time(c.created)}</small></div><p>${esc(c.body)}</p>${!reply&&!c.removed?'<button class="link" data-reply>답글</button>':''}${c.owned&&!c.removed?'<button class="link" data-delete-comment>삭제</button>':''}${triageControls(c,reply)}</li>`;
    list.innerHTML=top.length?`<ul class="comments">${top.map(c=>item(c,false)+replies(c.id).map(r=>item(r,true)).join('')).join('')}</ul>`:`<p class="muted">${filter?'이 분류의 댓글이 아직 없어요.':'첫 댓글을 남겨보세요.'}</p>`;
    const count=$('[data-comment-count]');const n=comments.filter(c=>!c.removed).length;if(count)count.textContent=n?`${n}개`:'';
  }
  // Creator triage: feedback and bug reports can be marked "확인함" or "반영됨" (optionally with the update that fixed it)
  function statusChip(c){
    if(!c.label||c.removed)return '';
    if(c.status==='fixed'){const label=c.status_entry_label?` · ${esc(c.status_entry_label)}`:'';return c.status_entry&&c.status_entry_label?`<a class="chip status-fixed" href="/works/${encodeURIComponent(cfg.id)}/e/${encodeURIComponent(c.status_entry)}">✓ 반영됨${label}</a>`:`<em class="chip status-fixed">✓ 반영됨</em>`;}
    return c.status==='ack'?'<em class="chip status-ack">작가 확인</em>':'';
  }
  function triageControls(c,reply){
    if(!cfg.owner||reply||c.removed||!c.label)return '';
    const opts=[['','새 의견'],['ack','확인함'],['fixed','반영됨']].map(([v,l])=>`<option value="${v}" ${(c.status||'')===v?'selected':''}>${l}</option>`).join('');
    const updates=cfg.updates?.length?`<select data-triage-entry ${c.status==='fixed'?'':'hidden'} aria-label="반영한 업데이트"><option value="">업데이트 연결 안 함</option>${cfg.updates.map(u=>`<option value="${esc(u.id)}" ${c.status_entry===u.id?'selected':''}>${esc(u.label)}</option>`).join('')}</select>`:'';
    return `<form class="triage" data-triage><label>상태 <select data-triage-status>${opts}</select></label>${updates}<button class="link">저장</button></form>`;
  }
  $('#comments')?.addEventListener('change',event=>{const status=event.target.closest('[data-triage-status]');if(!status)return;const entry=status.closest('form').querySelector('[data-triage-entry]');if(entry)entry.hidden=status.value!=='fixed';});
  $('#comments')?.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-triage]');if(!form)return;event.preventDefault();const id=form.closest('[data-comment]').dataset.comment;
    const status=form.querySelector('[data-triage-status]').value;const entry=form.querySelector('[data-triage-entry]');
    try{await api(`/api/community/triage/${encodeURIComponent(id)}`,'PUT',{status,entryId:status==='fixed'&&entry?entry.value:''});toast(status?'상태를 바꿨어요. 남긴 사람에게 알려드릴게요.':'상태를 지웠어요.');await loadComments();}catch(error){toast(error.message);}
  });
  async function loadComments(){try{const r=await api(`/api/community/comments?kind=project&id=${encodeURIComponent(cfg.id)}`);comments=r.comments;drawComments();}catch{}}
  $$('[data-comment-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.commentFilter;$$('[data-comment-filter]').forEach(x=>x.classList.toggle('on',x===b));drawComments();}));
  $('#comment-form')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;if(needLogin())return;const text=form.body.value.trim();if(!text)return;
    const button=$('button',form);button.disabled=true;
    try{await api('/api/community/comments','POST',{kind:'project',targetId:cfg.id,body:text,label:form.label?.value||''});form.body.value='';await loadComments();toast('댓글을 남겼어요.');}catch(error){if(error.message!=='consent')toast(error.message);}finally{button.disabled=false;}
  });
  $('#comments')?.addEventListener('click',async event=>{
    const li=event.target.closest('[data-comment]');if(!li)return;const id=li.dataset.comment;
    if(event.target.closest('[data-delete-comment]')){try{await api(`/api/community/comments/${encodeURIComponent(id)}`,'DELETE');await loadComments();}catch(error){toast(error.message);}return;}
    if(event.target.closest('[data-reply]')){
      if(needLogin())return;if($('.reply-form',li))return;
      li.insertAdjacentHTML('beforeend','<form class="reply-form"><textarea maxlength="2000" rows="2" placeholder="답글을 입력하세요."></textarea><button class="btn small primary">답글 남기기</button></form>');
      const form=$('.reply-form',li);$('textarea',form).focus();
      form.addEventListener('submit',async e=>{e.preventDefault();const text=$('textarea',form).value.trim();if(!text)return;try{await api('/api/community/comments','POST',{kind:'project',targetId:cfg.id,parentId:id,body:text});await loadComments();}catch(error){if(error.message!=='consent')toast(error.message);}});
    }
  });

  /* ───── Owner: write an episode or an update note ───── */
  const dialog=$('#entry-dialog');let editor=null,editingEntry='';
  function openEntry(entry){
    if(!dialog)return;
    editor||=window.BlockEditor.create($('#entry-body'),{hint:cfg.kind==='episode'?'이번 화의 글과 그림을 순서대로 넣어주세요.':'바뀐 점을 글로 정리하고, 필요하면 스크린샷을 넣어주세요.'});
    const form=$('#entry-form');form.reset();editingEntry=entry?.id||'';$('#entry-error').hidden=true;
    $('#entry-dialog-title').textContent=entry?(cfg.kind==='episode'?'회차 수정':'소식 수정'):(cfg.kind==='episode'?'새 회차 쓰기':'업데이트 소식 쓰기');
    if(cfg.kind==='episode')form.number.value=entry?.number||cfg.nextNumber;else form.version.value=entry?.version||'';
    form.title.value=entry?.title||'';form.note.value=entry?.note||'';form.status.value=entry?.status||'published';
    if(entry&&Number(entry.published_at)>Date.now()){const d=new Date(Number(entry.published_at)-new Date().getTimezoneOffset()*60000);form.publishAt.value=d.toISOString().slice(0,16);}
    editor.set(entry?.content||[]);$('[data-entry-delete]').hidden=!entry;dialog.showModal();
  }
  $('[data-new-entry]')?.addEventListener('click',()=>openEntry(null));
  $('[data-entry-cancel]')?.addEventListener('click',()=>dialog.close());
  // owners can open an existing entry for editing straight from the list
  if(cfg.owner)$$('[data-entry]').forEach(a=>{const b=document.createElement('button');b.className='link entry-edit';b.textContent='수정';b.addEventListener('click',async event=>{event.preventDefault();try{const r=await api(workApi(`/entries/${encodeURIComponent(a.dataset.entry)}`));openEntry(r.entry);}catch(error){toast(error.message);}});a.parentElement.append(b);});
  $('#entry-form')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;const content=editor.get();if(!content)return;
    const payload={title:form.title.value.trim(),note:form.note.value.trim(),status:form.status.value,content,publishAt:form.publishAt.value?new Date(form.publishAt.value).toISOString():''};
    if(cfg.kind==='episode')payload.number=Number(form.number.value);else payload.version=form.version.value.trim();
    const button=$('button.primary',form);button.disabled=true;$('#entry-error').hidden=true;
    try{await api(workApi(`/entries${editingEntry?`/${encodeURIComponent(editingEntry)}`:''}`),editingEntry?'PATCH':'POST',payload);dialog.close();toast(payload.status==='draft'?'임시 저장했어요.':'공개했어요. 찜한 사람과 팔로워에게 알림이 가요.');setTimeout(()=>location.reload(),600);}
    catch(error){$('#entry-error').textContent=error.message;$('#entry-error').hidden=false;}finally{button.disabled=false;}
  });
  $('[data-entry-delete]')?.addEventListener('click',async()=>{
    if(!editingEntry||!confirm('이 회차·소식을 삭제할까요? 되돌릴 수 없어요.'))return;
    try{await api(workApi(`/entries/${encodeURIComponent(editingEntry)}`),'DELETE');dialog.close();location.reload();}catch(error){toast(error.message);}
  });

  ratingForm();loadReviews();loadComments();
})();
