'use strict';
// 회차 쓰기 / 업데이트 소식 쓰기 (/works/:id/e/new, /works/:id/e/:entry/edit). Config: #editor-config.
(function(){
  const {$,toast,flash,guard}=window.Social;
  const cfg=JSON.parse($('#editor-config').textContent);
  const form=$('#entry-form'),unsaved=guard(form),workHref=`/works/${encodeURIComponent(cfg.id)}`;
  const entryApi=id=>`/api/projects/${encodeURIComponent(cfg.id)}/entries${id?`/${encodeURIComponent(id)}`:''}`;
  const editor=window.BlockEditor.create($('#entry-body'),{hint:cfg.hint});editor.set(cfg.content||[]);
  if(cfg.publishAt){const local=new Date(cfg.publishAt-new Date().getTimezoneOffset()*60000);form.publishAt.value=local.toISOString().slice(0,16);}
  const showError=message=>{const el=$('#entry-error');el.textContent=message;el.hidden=false;el.scrollIntoView({behavior:'smooth',block:'center'});};
  async function send(path,method,payload){
    const response=await fetch(path,{method,headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined});
    const result=await response.json().catch(()=>({}));
    // keep the page (and everything typed) when the session ran out: signing in happens in another tab
    if(response.status===401)throw Error('로그인이 끝났어요. 새 탭에서 다시 로그인한 뒤 이 화면에서 저장해주세요.');
    if(!response.ok)throw Error(result.error||'저장하지 못했어요. 잠시 후 다시 시도해주세요.');
    return result;
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();$('#entry-error').hidden=true;
    const title=form.title.value.trim();if(!title){showError(cfg.kind==='episode'?'회차 제목을 입력해주세요.':'업데이트 제목을 입력해주세요.');form.title.focus();return;}
    const content=editor.get();if(!content)return;
    const payload={title,note:form.note.value.trim(),status:form.status.value,content,publishAt:form.publishAt.value?new Date(form.publishAt.value).toISOString():''};
    if(cfg.kind==='episode')payload.number=Number(form.number.value);else payload.version=form.version.value.trim();
    const button=$('#entry-submit');button.disabled=true;
    try{
      const result=await send(entryApi(cfg.entryId),cfg.entryId?'PATCH':'POST',payload);const id=cfg.entryId||result.id;unsaved.clean();
      const scheduled=payload.publishAt&&new Date(payload.publishAt).getTime()>Date.now();
      if(payload.status==='draft'){if(cfg.entryId){toast('임시 저장했어요.');return;}flash('임시 저장했어요. 이어서 쓸 수 있어요.');location.replace(`${workHref}/e/${encodeURIComponent(id)}/edit`);return;}
      flash(scheduled?'예약했어요. 공개 시각에 찜한 사람과 팔로워에게 알림이 가요.':cfg.entryId?'수정 내용을 저장했어요.':'공개했어요. 찜한 사람과 팔로워에게 알림이 가요.');
      location.href=`${workHref}/e/${encodeURIComponent(id)}`;
    }catch(error){showError(error.message);}finally{button.disabled=false;}
  });
  $('[data-entry-delete]')?.addEventListener('click',async event=>{
    if(!await window.DS.confirm({title:'이 회차·소식을 삭제할까요?',message:'댓글과 이미지도 함께 지워지고 되돌릴 수 없어요.',confirmLabel:'삭제',tone:'danger'}))return;
    const button=event.currentTarget;button.disabled=true;
    try{await send(entryApi(cfg.entryId),'DELETE');unsaved.clean();flash('삭제했어요.');location.href=`/studio/works/${encodeURIComponent(cfg.id)}#entries`;}catch(error){showError(error.message);button.disabled=false;}
  });
})();
