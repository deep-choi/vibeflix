'use strict';
// Episode / update-note page: readers talk about this episode (public/social.js), save the work to hear about the
// next one, and see the 성인 소재 gate. Config comes from #entry-config (server-rendered).
(function(){
  const {$,toast,api,needLogin}=window.Social;
  const cfg=JSON.parse($('#entry-config')?.textContent||'{}');
  window.Social.setMember(cfg.loggedIn);

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
  window.Social.discussion($('#entry-comments'),{kind:'entry',id:cfg.id,workId:cfg.workId,empty:'이 회차의 첫 감상을 남겨보세요.',placeholder:cfg.loggedIn?'감상이나 응원을 남겨주세요. 스포일러는 조심해주세요.':'로그인하면 댓글을 남길 수 있어요.'});
})();
