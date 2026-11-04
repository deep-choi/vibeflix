'use strict';
// Episode / update-note page: readers talk about this episode, save the work to hear about the next one,
// report a comment, and see the 성인 소재 gate. Config comes from #entry-config (server-rendered).
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cfg=JSON.parse($('#entry-config')?.textContent||'{}');
  const time=t=>{const d=Math.round((Date.now()-Number(t))/60000);return d<1?'방금':d<60?`${d}분 전`:d<1440?`${Math.round(d/60)}시간 전`:new Date(Number(t)).toLocaleDateString('ko-KR');};
  const toast=message=>window.DS?.toast(message);
  const loginUrl=()=>`/?login=1&next=${encodeURIComponent(location.pathname+location.hash)}`;
  async function api(path,method='GET',payload){
    const response=await fetch(path,{method,headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined});
    const data=await response.json().catch(()=>({}));
    if(response.status===401){location.href=loginUrl();throw Error('로그인이 필요해요.');}
    if(!response.ok)throw Error(data.error||'요청을 처리하지 못했어요.');
    return data;
  }
  const needLogin=()=>{if(cfg.loggedIn)return false;location.href=loginUrl();return true;};

  /* 성인 소재 gate (shared with the work page through sessionStorage) */
  if(cfg.mature){
    const okKey='vibeflix.mature-ok';const seen=()=>{try{return JSON.parse(sessionStorage.getItem(okKey)||'[]');}catch{return [];}};
    const open=()=>{$('main')?.classList.remove('is-gated');$('.mature-gate')?.remove();};
    if(seen().includes(cfg.workId))open();
    $('[data-mature-ok]')?.addEventListener('click',()=>{try{sessionStorage.setItem(okKey,JSON.stringify([...seen(),cfg.workId]));}catch{}open();});
  }

  /* Save the work → new episodes arrive as notifications */
  $('[data-save-work]')?.addEventListener('click',async event=>{
    const b=event.currentTarget;if(needLogin())return;b.disabled=true;
    try{await api('/api/community/bookmarks','PUT',{projectId:cfg.workId,active:true});b.closest('.follow-cta').innerHTML='<p>✓ 찜했어요. 새 회차가 올라오면 알림으로 알려드릴게요.</p>';}
    catch(error){toast(error.message);b.disabled=false;}
  });

  /* Episode comments */
  let comments=[];
  function draw(){
    const list=$('#entry-comments');if(!list)return;
    const top=comments.filter(c=>!c.parent_id),replies=id=>comments.filter(c=>c.parent_id===id);
    const item=(c,reply)=>`<li class="comment${reply?' reply':''}" data-comment="${esc(c.id)}"><div class="comment-head"><b>${esc(c.author_name)}</b><small>${time(c.created)}</small></div><p>${esc(c.body)}</p>${c.removed?'':`${reply?'':'<button class="link" data-reply>답글</button>'}${c.owned?'<button class="link" data-delete>삭제</button>':cfg.loggedIn?'<button class="link" data-report>신고</button>':''}`}</li>`;
    list.innerHTML=top.length?top.map(c=>item(c,false)+replies(c.id).map(r=>item(r,true)).join('')).join(''):'<li class="muted">이 회차의 첫 감상을 남겨보세요.</li>';
    const n=comments.filter(c=>!c.removed).length;$('[data-comment-count]').textContent=n?`${n}개`:'';
  }
  async function load(){try{comments=(await api(`/api/community/comments?kind=entry&id=${encodeURIComponent(cfg.id)}`)).comments;draw();}catch{}}
  $('#entry-comment-form')?.addEventListener('submit',async event=>{
    event.preventDefault();if(needLogin())return;const form=event.currentTarget;const text=form.body.value.trim();if(!text)return;const button=$('button',form);button.disabled=true;
    try{await api('/api/community/comments','POST',{kind:'entry',targetId:cfg.id,body:text});form.body.value='';await load();toast('감상을 남겼어요.');}catch(error){toast(error.message);}finally{button.disabled=false;}
  });
  $('#entry-comments')?.addEventListener('click',async event=>{
    const li=event.target.closest('[data-comment]');if(!li)return;const id=li.dataset.comment;
    if(event.target.closest('[data-delete]')){if(!await window.DS.confirm({title:'이 댓글을 지울까요?',message:'답글이 달려 있으면 ‘삭제된 댓글’로 남아요.',confirmLabel:'삭제',tone:'danger'}))return;try{await api(`/api/community/comments/${encodeURIComponent(id)}`,'DELETE');await load();}catch(error){toast(error.message);}return;}
    if(event.target.closest('[data-report]')){reportComment(id);return;}
    if(event.target.closest('[data-reply]')){
      if(needLogin()||$('.reply-form',li))return;
      li.insertAdjacentHTML('beforeend','<form class="reply-form"><textarea maxlength="2000" rows="2" placeholder="답글을 입력하세요."></textarea><button class="btn small primary">답글 남기기</button></form>');
      const form=$('.reply-form',li);$('textarea',form).focus();
      form.addEventListener('submit',async e=>{e.preventDefault();const text=$('textarea',form).value.trim();if(!text)return;try{await api('/api/community/comments','POST',{kind:'entry',targetId:cfg.id,parentId:id,body:text});await load();}catch(error){toast(error.message);}});
    }
  });
  // A small report form (same categories as the rest of the site)
  let dialog=null;
  function reportComment(id){
    if(!dialog){dialog=document.createElement('dialog');dialog.className='modal modal-sm entry-report';dialog.setAttribute('aria-labelledby','entry-report-title');dialog.innerHTML='<button class="modal-close" aria-label="닫기" data-close></button><form><h2 id="entry-report-title">이 댓글을 신고할까요?</h2><p class="modal-desc">운영자가 내용을 확인해요. 신고한 사람은 공개되지 않아요.</p><label>어떤 문제인가요?<select name="category"><option value="spam">스팸·광고</option><option value="abuse">욕설·괴롭힘</option><option value="copyright">도용·저작권 침해</option><option value="privacy">개인정보 노출</option><option value="sexual">음란·선정적인 내용</option><option value="malicious">악성 링크·사기</option><option value="other">기타 (사유 필수)</option></select></label><label>자세한 내용<textarea name="reason" maxlength="500" rows="3"></textarea></label><div class="modal-actions"><button type="button" class="btn" data-close>취소</button><button class="btn primary">신고 접수</button></div></form>';document.body.append(dialog);
      dialog.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);try{await api('/api/community/reports','POST',{kind:'comment',targetId:dialog.dataset.id,category:f.get('category'),reason:f.get('reason')});dialog.close();toast('신고가 접수됐어요. 운영자가 확인할게요.');}catch(error){toast(error.message);}});}
    dialog.dataset.id=id;dialog.querySelector('form').reset();dialog.showModal();
  }
  load();
})();
