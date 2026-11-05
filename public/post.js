'use strict';
// Community post page (/posts/:id): recommend, share, delete and the comments (public/social.js). Config: #post-config.
(function(){
  const {$,toast,api,needLogin,flash,failed}=window.Social;
  const cfg=JSON.parse($('#post-config').textContent);
  window.Social.setMember(cfg.loggedIn);
  $('[data-recommend]')?.addEventListener('click',async event=>{
    const b=event.currentTarget;if(needLogin())return;b.disabled=true;
    try{const s=await api('/api/community/react','PUT',{kind:'post',targetId:cfg.id,active:!cfg.recommended});cfg.recommended=s.recommended;b.classList.toggle('on',s.recommended);b.setAttribute('aria-pressed',String(s.recommended));$('[data-recommend-count]',b).textContent=s.recommendations||'';}
    catch(error){failed(error);}finally{b.disabled=false;}
  });
  $('[data-share]')?.addEventListener('click',async()=>{
    const url=location.origin+location.pathname;
    try{if(navigator.share)await navigator.share({title:cfg.title,url});else{await navigator.clipboard.writeText(url);toast('링크를 복사했어요.');}}catch{}
  });
  $('[data-delete-post]')?.addEventListener('click',async event=>{
    const b=event.currentTarget;if(!await window.DS.confirm({title:'이 글을 삭제할까요?',message:'삭제하면 다른 방문자에게 보이지 않고, 되돌릴 수 없어요.',confirmLabel:'삭제',tone:'danger'}))return;
    b.disabled=true;try{await api(`/api/community/posts/${encodeURIComponent(cfg.id)}`,'DELETE');flash('글을 삭제했어요.');location.href='/#community';}catch(error){failed(error);b.disabled=false;}
  });
  const question=cfg.category==='question'?{owned:cfg.owned,solved:cfg.solved,onChange:solved=>{$('[data-question-badge]').innerHTML=solved?'<em class="chip status-fixed">✓ 해결됨</em>':'<em class="chip">답변 기다림</em>';}}:null;
  if(!cfg.hidden)window.Social.discussion($('#comments'),{kind:'post',id:cfg.id,question,empty:question?'첫 번째 답변을 남겨주세요.':'아직 댓글이 없어요. 첫 번째 이야기를 남겨주세요.',placeholder:cfg.loggedIn?'직접 써본 경험이나 따뜻한 피드백을 나눠주세요.':'로그인하면 댓글을 남길 수 있어요.'});
})();
