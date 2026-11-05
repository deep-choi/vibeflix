'use strict';
// 이야기 쓰기 / 수정 (/posts/new, /posts/:id/edit). Config: #editor-config. New stories keep a draft in this browser.
(function(){
  const {$,flash,guard}=window.Social;
  const cfg=JSON.parse($('#editor-config').textContent);
  const form=$('#post-form'),unsaved=guard(form),key=cfg.draftKey;
  let timer;
  if(key){
    try{
      const draft=JSON.parse(localStorage.getItem(key)||'null');
      if(draft){for(const name of ['title','body','category','projectId'])if(draft[name]&&form.elements.namedItem(name))form.elements.namedItem(name).value=draft[name];$('#draft-status').textContent='저장해 둔 초안을 불러왔어요.';}
    }catch{}
    form.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{try{localStorage.setItem(key,JSON.stringify(Object.fromEntries(new FormData(form))));$('#draft-status').textContent='초안을 이 브라우저에 저장했어요.';}catch{$('#draft-status').textContent='브라우저 저장 공간이 없어 초안을 저장하지 못했어요.';}},500);});
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();const button=$('#post-submit'),error=$('#post-form-error');if(button.disabled)return;button.disabled=true;error.hidden=true;
    try{
      const response=await fetch(`/api/community/posts${cfg.id?`/${encodeURIComponent(cfg.id)}`:''}`,{method:cfg.id?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});
      const result=await response.json().catch(()=>({}));
      // keep the page (and everything typed) when the session ran out: signing in happens in another tab
      if(response.status===401)throw Error('로그인이 끝났어요. 새 탭에서 다시 로그인한 뒤 이 화면에서 저장해주세요.');
      if(!response.ok)throw Error(result.error||'저장하지 못했어요. 잠시 후 다시 시도해주세요.');
      clearTimeout(timer);if(key)try{localStorage.removeItem(key);}catch{}
      unsaved.clean();flash(cfg.id?'이야기를 수정했어요.':'이야기가 공개되었어요.');location.href=`/posts/${encodeURIComponent(cfg.id||result.id)}`;
    }catch(e){error.textContent=e.message;error.hidden=false;error.scrollIntoView({behavior:'smooth',block:'center'});}finally{button.disabled=false;}
  });
})();
