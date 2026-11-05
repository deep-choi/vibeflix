'use strict';
// Shared by the server-rendered pages (work, episode, post, creator, and the writing pages).
//   Social.api(path, method, payload)  JSON call: 401 goes to sign-in, 428 explains the terms step
//   Social.discussion(root, options)   comments: replies, edit, delete, recommend, report, creator triage, accepted answer
//   Social.report(kind, id)            the report form (any [data-report-kind] button opens it)
//   Social.guard(form)                 asks before leaving a form that has unsaved input
//   Social.flash(message)              a toast shown on the next page
(function(){
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time=t=>{const d=Math.round((Date.now()-Number(t))/60000);return d<1?'방금':d<60?`${d}분 전`:d<1440?`${Math.round(d/60)}시간 전`:new Date(Number(t)).toLocaleDateString('ko-KR');};
  const toast=(message,options)=>window.DS?.toast(message,options);
  const loginUrl=()=>`/?login=1&next=${encodeURIComponent(location.pathname+location.hash)}`;
  let member=false;
  const setMember=value=>{member=!!value;};
  const needLogin=()=>{if(member)return false;location.href=loginUrl();return true;};
  async function api(path,method='GET',payload){
    const response=await fetch(path,{method,headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined});
    const data=await response.json().catch(()=>({}));
    if(response.status===401){location.href=loginUrl();throw Error('로그인이 필요해요.');}
    if(response.status===428){toast(data.error||'내 계정에서 이용약관에 동의한 뒤 작성해주세요.');throw Error('consent');}
    if(!response.ok)throw Error(data.error||'요청을 처리하지 못했어요.');
    return data;
  }
  const failed=error=>{if(error.message!=='consent')toast(error.message);};

  /* ───── A toast that survives a page change ───── */
  const FLASH='vibeflix.flash';
  const flash=message=>{try{sessionStorage.setItem(FLASH,message);}catch{}};
  try{const message=sessionStorage.getItem(FLASH);if(message){sessionStorage.removeItem(FLASH);setTimeout(()=>toast(message),60);}}catch{}

  /* ───── The back link returns to the very place the visitor came from (scroll position included) ───── */
  $('header.top .back')?.addEventListener('click',event=>{
    try{const from=new URL(document.referrer),to=new URL(event.currentTarget.href);if(from.origin===location.origin&&from.pathname===to.pathname&&history.length>1){event.preventDefault();history.back();}}catch{}
  });

  /* ───── Writing pages: unsaved input and the section menu ───── */
  function guard(form){
    let dirty=false;const mark=event=>{if(event.isTrusted)dirty=true;};
    form.addEventListener('input',mark);form.addEventListener('change',mark);
    // block-editor moves, removals and genre chips change the form without an input event
    form.addEventListener('click',event=>{if(event.target.closest?.('[data-move],[data-remove],[data-genre],[data-guard-click]'))mark(event);});
    window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
    return {clean(){dirty=false;},mark(){dirty=true;}};
  }
  const sections=$$('.fp-nav a');
  if(sections.length&&'IntersectionObserver' in window){
    const links=new Map(sections.map(a=>[a.getAttribute('href').slice(1),a]));
    const select=id=>links.forEach((a,key)=>{a.toggleAttribute('aria-current',key===id);});
    select(links.keys().next().value);
    const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)select(entry.target.id);},{rootMargin:'-20% 0px -70% 0px'});
    links.forEach((_,id)=>{const el=document.getElementById(id);if(el)observer.observe(el);});
  }

  /* ───── Report form ───── */
  const CATEGORIES=[['spam','스팸·광고'],['abuse','욕설·괴롭힘'],['copyright','도용·저작권 침해'],['privacy','개인정보 노출'],['sexual','음란·선정적인 내용'],['malicious','악성 링크·사기'],['other','기타']];
  let reportDialog=null;
  function report(kind,id){
    if(needLogin())return;
    if(!reportDialog){
      const d=document.createElement('dialog');d.className='modal modal-sm';d.setAttribute('data-guard-unsaved','');d.setAttribute('aria-labelledby','report-title');
      d.innerHTML=`<button class="modal-close" aria-label="닫기" data-close></button><h2 id="report-title">이 콘텐츠를 신고할까요?</h2><p class="modal-desc">운영자가 내용을 확인합니다. 신고자의 정보는 공개되지 않습니다.</p><form><label>어떤 문제인가요?<select name="category" required>${CATEGORIES.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label><span data-reason-label>자세한 내용 <small>선택</small></span><textarea name="reason" maxlength="500" rows="4"></textarea></label><p class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="btn" data-close>취소</button><button class="btn primary">신고 접수하기</button></div></form>`;
      document.body.append(d);reportDialog=d;
      const form=$('form',d),error=$('.form-error',d);
      // "기타" and 도용 need a written reason; for the rest it is optional context
      const sync=()=>{const category=form.category.value;const needed=category==='other'||category==='copyright';form.reason.required=needed;form.reason.minLength=needed?5:0;$('[data-reason-label]',d).innerHTML=category==='copyright'?'원본 작품 링크와 설명 <small>필수</small>':needed?'자세한 내용 <small>필수</small>':'자세한 내용 <small>선택</small>';form.reason.placeholder=category==='copyright'?'원본 작품의 주소와, 내 작품(또는 권리가 있는 작품)이라는 걸 알 수 있는 내용을 적어주세요.':'운영자가 빨리 확인할 수 있게 상황을 알려주세요.';};
      d.sync=sync;form.category.addEventListener('change',sync);
      form.addEventListener('submit',async event=>{
        event.preventDefault();const button=$('button.primary',form);if(button.disabled)return;button.disabled=true;error.hidden=true;
        try{await api('/api/community/reports','POST',{kind:d.dataset.kind,targetId:d.dataset.id,category:form.category.value,reason:form.reason.value});d.close();toast('신고가 접수되었습니다. 운영자가 확인할게요.');}
        catch(e){error.textContent=e.message;error.hidden=false;}finally{button.disabled=false;}
      });
    }
    const d=reportDialog;d.dataset.kind=kind;d.dataset.id=id;$('form',d).reset();$('.form-error',d).hidden=true;d.sync();d.showModal();
  }
  document.addEventListener('click',event=>{const button=event.target.closest?.('[data-report-kind]');if(button)report(button.dataset.reportKind,button.dataset.reportId);});

  /* ───── Comments ─────
   * options: kind, id, placeholder, empty, labels (feedback / bug-report tags), owner + updates (creator triage),
   * question ({owned, solved, onChange}: the asker accepts an answer) */
  const LABELS={feedback:'피드백',bug:'버그 제보'};
  function discussion(root,options){
    if(!root)return null;
    const {kind,id,placeholder='',empty='첫 댓글을 남겨보세요.',labels=false,owner=false,updates=[],workId='',question=null}=options;
    let comments=[],next=null,filter='';
    root.innerHTML=`${member?'':`<a class="btn small login-prompt" href="${esc(loginUrl())}">로그인하고 댓글 남기기</a>`}<form class="comment-form" data-new-comment${member?'':' hidden'}>${labels?'<select name="label" aria-label="댓글 분류"><option value="">댓글</option><option value="feedback">피드백</option><option value="bug">버그 제보</option></select>':''}<textarea name="body" maxlength="2000" rows="1" aria-label="댓글 내용" placeholder="${esc(placeholder)}"></textarea><button class="btn small primary">남기기</button></form>${labels?'<div class="comment-tabs" role="group" aria-label="댓글 분류" hidden><button type="button" data-comment-filter="" class="on">전체</button><button type="button" data-comment-filter="feedback">피드백</button><button type="button" data-comment-filter="bug">버그 제보</button></div>':''}<ul class="comments" data-comment-list></ul><button type="button" class="link comments-more" data-comments-more hidden>댓글 더 보기 ↓</button>`;
    const list=$('[data-comment-list]',root),more=$('[data-comments-more]',root),compose=$('[data-new-comment]',root),tabs=$('.comment-tabs',root);
    compose.addEventListener('focusin',()=>compose.classList.add('open'));
    compose.addEventListener('focusout',event=>{if(!compose.contains(event.relatedTarget)&&!compose.body.value.trim())compose.classList.remove('open');});
    const statusChip=c=>{
      if(!c.label||c.removed)return '';
      if(c.status==='fixed'){const label=c.status_entry_label?` · ${esc(c.status_entry_label)}`:'';return c.status_entry&&c.status_entry_label?`<a class="chip status-fixed" href="/works/${encodeURIComponent(workId)}/e/${encodeURIComponent(c.status_entry)}">✓ 반영됨${label}</a>`:'<em class="chip status-fixed">✓ 반영됨</em>';}
      return c.status==='ack'?'<em class="chip status-ack">작가 확인</em>':'';
    };
    // Creator triage: feedback and bug reports can be marked "확인함" or "반영됨" (optionally with the update that fixed it)
    const triage=(c,reply)=>{
      if(!owner||reply||c.removed||!c.label)return '';
      const options=[['','새 의견'],['ack','확인함'],['fixed','반영됨']].map(([v,l])=>`<option value="${v}" ${(c.status||'')===v?'selected':''}>${l}</option>`).join('');
      const entries=updates.length?`<select data-triage-entry ${c.status==='fixed'?'':'hidden'} aria-label="반영한 업데이트"><option value="">업데이트 연결 안 함</option>${updates.map(u=>`<option value="${esc(u.id)}" ${c.status_entry===u.id?'selected':''}>${esc(u.label)}</option>`).join('')}</select>`:'';
      return `<form class="triage" data-triage><label>상태 <select data-triage-status>${options}</select></label>${entries}<button class="link">저장</button></form>`;
    };
    const actions=(c,reply)=>{
      if(c.removed)return '';const out=[];const n=Number(c.recommendations)||0;
      if(!c.owned)out.push(`<button type="button" class="link${c.recommended?' selected':''}" data-like aria-pressed="${!!c.recommended}">♡ ${n||'추천'}</button>`);else if(n)out.push(`<span class="comment-likes">♡ ${n}</span>`);
      if(question?.owned&&!reply&&!c.owned)out.push(`<button type="button" class="link" data-accept>${question.solved===c.id?'채택 취소':'이 답변 채택'}</button>`);
      if(!reply)out.push('<button type="button" class="link" data-reply>답글</button>');
      if(c.owned)out.push('<button type="button" class="link" data-edit>수정</button><button type="button" class="link" data-delete>삭제</button>');
      else if(member)out.push(`<button type="button" class="link" data-report-kind="comment" data-report-id="${esc(c.id)}">신고</button>`);
      return `<div class="comment-actions">${out.join('')}</div>`;
    };
    const item=(c,reply)=>`<li class="comment${reply?' reply':''}" id="comment-${esc(c.id)}" data-comment="${esc(c.id)}"><div class="comment-head"><b>${esc(c.author_name)}</b>${c.label?`<em class="chip label-${esc(c.label)}">${LABELS[c.label]||''}</em>`:''}${statusChip(c)}${question?.solved===c.id?'<em class="chip status-fixed">✓ 채택된 답변</em>':''}<small>${time(c.created)}${c.updated>c.created&&!c.removed?' · 수정됨':''}</small></div><p class="comment-body">${esc(c.body)}</p>${actions(c,reply)}${triage(c,reply)}</li>`;
    function draw(){
      const top=comments.filter(c=>!c.parent_id&&(!filter||c.label===filter));const replies=parent=>comments.filter(c=>c.parent_id===parent);
      const known=new Set(comments.map(c=>c.id));const orphans=filter?[]:comments.filter(c=>c.parent_id&&!known.has(c.parent_id)); // a reply whose parent is on a later page
      list.innerHTML=top.length||orphans.length?[...top.map(c=>item(c,false)+replies(c.id).map(r=>item(r,true)).join('')),...orphans.map(c=>item(c,true))].join(''):`<li class="muted">${filter?'이 분류의 댓글이 아직 없어요.':esc(empty)}</li>`;
      more.hidden=next===null;if(tabs)tabs.hidden=!comments.some(c=>c.label);
      const count=$('[data-comment-count]');const n=comments.filter(c=>!c.removed).length;if(count)count.textContent=n?`${n}${next===null?'':'+'}개`:'';
    }
    async function load(append=false){
      try{const r=await api(`/api/community/comments?${new URLSearchParams({kind,id,offset:String(append?next||0:0)})}`);comments=append?[...comments,...r.comments]:r.comments;next=r.next;draw();}catch{}
    }
    const find=id=>comments.find(c=>c.id===id);
    more.addEventListener('click',()=>load(true));
    $$('[data-comment-filter]',root).forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.commentFilter;$$('[data-comment-filter]',root).forEach(x=>x.classList.toggle('on',x===b));draw();}));
    root.addEventListener('change',event=>{const status=event.target.closest('[data-triage-status]');if(!status)return;const entry=status.closest('form').querySelector('[data-triage-entry]');if(entry)entry.hidden=status.value!=='fixed';});
    root.addEventListener('submit',async event=>{
      const form=event.target;event.preventDefault();const button=$('button.primary,button.link',form);
      const send=async action=>{if(button?.disabled)return;if(button)button.disabled=true;try{await action();}catch(error){failed(error);}finally{if(button)button.disabled=false;}};
      if(form.matches('[data-new-comment]')){
        if(needLogin())return;const text=form.body.value.trim();if(!text)return;
        return send(async()=>{await api('/api/community/comments','POST',{kind,targetId:id,body:text,label:form.label?.value||''});form.body.value='';form.classList.remove('open');await load();toast('댓글을 남겼어요.');});
      }
      if(form.matches('[data-reply-form]')){const text=$('textarea',form).value.trim();if(!text)return;return send(async()=>{await api('/api/community/comments','POST',{kind,targetId:id,parentId:form.closest('[data-comment]').dataset.comment,body:text});await load();});}
      if(form.matches('[data-edit-form]')){const text=$('textarea',form).value.trim();if(!text)return;return send(async()=>{await api(`/api/community/comments/${encodeURIComponent(form.closest('[data-comment]').dataset.comment)}`,'PATCH',{body:text});await load();});}
      if(form.matches('[data-triage]')){
        const status=$('[data-triage-status]',form).value,entry=$('[data-triage-entry]',form);
        return send(async()=>{await api(`/api/community/triage/${encodeURIComponent(form.closest('[data-comment]').dataset.comment)}`,'PUT',{status,entryId:status==='fixed'&&entry?entry.value:''});toast(status?'상태를 바꿨어요. 남긴 사람에게 알려드릴게요.':'상태를 지웠어요.');await load();});
      }
    });
    root.addEventListener('click',async event=>{
      const li=event.target.closest('[data-comment]');if(!li)return;const commentId=li.dataset.comment;const c=find(commentId);
      const hit=name=>event.target.closest(`[${name}]`);
      try{
        if(hit('data-like')){if(needLogin())return;const r=await api('/api/community/react','PUT',{kind:'comment',targetId:commentId,active:!c.recommended});c.recommended=r.recommended;c.recommendations=r.recommendations;draw();return;}
        if(hit('data-accept')){const solved=question.solved===commentId?null:commentId;const r=await api(`/api/community/posts/${encodeURIComponent(id)}/solve`,'PUT',{commentId:solved});question.solved=r.solvedComment;question.onChange?.(r.solvedComment);draw();toast(solved?'답변을 채택했어요. 답한 분께 알려드릴게요.':'채택을 취소했어요.');return;}
        if(hit('data-delete')){if(!await window.DS.confirm({title:'이 댓글을 지울까요?',message:'답글이 달려 있으면 ‘삭제된 댓글’로 남아요.',confirmLabel:'삭제',tone:'danger'}))return;await api(`/api/community/comments/${encodeURIComponent(commentId)}`,'DELETE');await load();return;}
      }catch(error){failed(error);return;}
      if(hit('data-reply')){
        if(needLogin()||$('[data-reply-form]',li))return;
        li.insertAdjacentHTML('beforeend','<form class="reply-form" data-reply-form><textarea maxlength="2000" rows="2" aria-label="답글 내용" placeholder="답글을 입력하세요."></textarea><button class="btn small primary">답글 남기기</button></form>');$('[data-reply-form] textarea',li).focus();return;
      }
      if(hit('data-edit')){
        if($('[data-edit-form]',li))return;const body=$('.comment-body',li);body.hidden=true;
        body.insertAdjacentHTML('afterend',`<form class="reply-form" data-edit-form><textarea maxlength="2000" rows="3" aria-label="수정할 댓글">${esc(c.body)}</textarea><button class="btn small primary">수정 저장</button><button type="button" class="btn small" data-edit-cancel>취소</button></form>`);$('[data-edit-form] textarea',li).focus();return;
      }
      if(hit('data-edit-cancel')){$('[data-edit-form]',li)?.remove();$('.comment-body',li).hidden=false;}
    });
    load();
    return {reload:load};
  }

  window.Social={$,$$,esc,time,toast,api,failed,loginUrl,setMember,needLogin,flash,guard,report,discussion};
})();
