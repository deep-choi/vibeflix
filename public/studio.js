'use strict';
// 내 스튜디오 (/studio): the works filter, taking a work out of the public list and back, and feedback. Config: #studio-config.
(function(){
  const {$,$$,api,toast,flash,setMember}=window.Social;
  const cfg=JSON.parse($('#studio-config')?.textContent||'{}');
  setMember(true);

  /* ───── Works list filter ───── */
  const filters=$$('[data-work-filter]');
  filters.forEach(button=>button.addEventListener('click',()=>{
    const state=button.dataset.workFilter;filters.forEach(b=>{if(b===button)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');});
    $$('.st-work').forEach(row=>{row.hidden=!!state&&row.dataset.state!==state;});
  }));

  /* ───── One work ───── */
  if(!cfg.id)return;
  const workApi=`/api/projects/${encodeURIComponent(cfg.id)}`;
  $('[data-remove-work]')?.addEventListener('click',async event=>{
    const button=event.currentTarget;if(!await window.DS.confirm({title:'이 작품을 공개 목록에서 내릴까요?',message:'작품은 지워지지 않고, 이 화면에서 다시 공개할 수 있어요.',confirmLabel:'목록에서 내리기',tone:'danger'}))return;
    button.disabled=true;try{await api(workApi,'DELETE');flash('작품을 공개 목록에서 내렸어요.');location.reload();}catch(error){toast(error.message);button.disabled=false;}
  });
  $('[data-restore-work]')?.addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{await api(workApi,'PATCH',{restore:true});flash('작품을 다시 공개했어요.');location.reload();}catch(error){toast(error.message);button.disabled=false;}
  });
  if(cfg.discussable)window.Social.discussion($('#comments'),{kind:'project',id:cfg.id,workId:cfg.id,labels:cfg.labels,owner:true,updates:cfg.updates||[],empty:'아직 받은 댓글이 없어요.',placeholder:'댓글에 답하거나 소식을 남겨보세요.'});
})();
