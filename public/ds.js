'use strict';
// VIBEFLIX design system behaviors (docs/DESIGN_SYSTEM.md). Loaded before every page script.
//   DS.toast(message, {tone:'danger'})      one toast, shown above any open modal (popover top layer)
//   DS.confirm({title, message, confirmLabel, cancelLabel, tone:'danger'}) → Promise<boolean>
//   DS.requestClose(dialog)                  closes a modal, asking first if it has unsaved input
// Shared modal behavior for every <dialog class="modal">:
//   · [data-close] buttons and a click on the backdrop close it (unless data-dismiss="manual")
//   · data-guard-unsaved: typing marks it dirty; closing by any route asks before throwing the input away
//   · on phones the modal is a bottom sheet; dragging its handle down closes it
(function(){
  if(window.DS)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const supportsPopover=typeof HTMLElement!=='undefined'&&'popover' in HTMLElement.prototype;

  /* ───── Toast ───── */
  let toastEl=null,toastTimer=0;
  function toast(message,{tone='',duration=3200}={}){
    if(!message)return;
    if(!toastEl){
      toastEl=document.createElement('div');toastEl.className='ds-toast';toastEl.setAttribute('role','status');toastEl.setAttribute('aria-live','polite');
      if(supportsPopover)toastEl.popover='manual';else toastEl.hidden=true;
      document.body.append(toastEl);
    }
    toastEl.textContent=String(message);toastEl.classList.toggle('danger',tone==='danger');
    // While a modal is open everything outside it is inert (not announced, not hit-testable), so the toast lives
    // inside the topmost open modal; as a popover it still renders in the top layer, against the viewport.
    const host=[...document.querySelectorAll('dialog[open]')].filter(d=>d.matches(':modal')).pop()||document.body;
    if(toastEl.parentNode!==host){if(supportsPopover){try{toastEl.hidePopover();}catch{}}host.append(toastEl);}
    // re-entering the top layer puts the toast above a modal opened after the last toast
    if(supportsPopover){try{toastEl.hidePopover();}catch{}try{toastEl.showPopover();}catch{}}else toastEl.hidden=false;
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>{if(supportsPopover){try{toastEl.hidePopover();}catch{}}else toastEl.hidden=true;},duration);
  }

  /* ───── Confirm ───── */
  let confirmCount=0;
  function confirm({title='계속할까요?',message='',confirmLabel='확인',cancelLabel='취소',tone=''}={}){
    return new Promise(resolve=>{
      const id=`ds-confirm-${++confirmCount}`;const d=document.createElement('dialog');
      d.className='modal modal-sm ds-confirm';d.setAttribute('aria-labelledby',id);if(message)d.setAttribute('aria-describedby',id+'-desc');
      d.innerHTML=`<form method="dialog"><h2 id="${id}">${esc(title)}</h2>${message?`<p class="modal-desc" id="${id}-desc">${esc(message)}</p>`:''}<div class="modal-actions"><button class="btn" value="cancel">${esc(cancelLabel)}</button><button class="btn primary${tone==='danger'?' danger':''}" value="ok">${esc(confirmLabel)}</button></div></form>`;
      document.body.append(d);
      d.addEventListener('close',()=>{resolve(d.returnValue==='ok');d.remove();},{once:true});
      d.showModal();
      // destructive questions start on the safe answer
      d.querySelector(tone==='danger'?'[value="cancel"]':'[value="ok"]').focus();
    });
  }

  /* ───── Closing, with an unsaved-input guard ───── */
  const dirty=d=>d.hasAttribute('data-guard-unsaved')&&d.dataset.dirty==='1';
  async function requestClose(d,value){
    if(!d||!d.open)return false;
    if(dirty(d)&&!await confirm({title:'작성 중인 내용을 닫을까요?',message:'저장하지 않은 내용은 사라져요.',confirmLabel:'닫기',cancelLabel:'계속 쓰기',tone:'danger'}))return false;
    d.close(value);return true;
  }
  document.addEventListener('input',event=>{if(!event.isTrusted)return;const d=event.target.closest?.('dialog[data-guard-unsaved]');if(d)d.dataset.dirty='1';},true);
  document.addEventListener('change',event=>{if(!event.isTrusted)return;const d=event.target.closest?.('dialog[data-guard-unsaved]');if(d)d.dataset.dirty='1';},true);
  // close/cancel do not bubble; capture sees them for every dialog
  document.addEventListener('close',event=>{if(event.target instanceof HTMLDialogElement)delete event.target.dataset.dirty;},true);
  document.addEventListener('cancel',event=>{const d=event.target;if(d instanceof HTMLDialogElement&&dirty(d)){event.preventDefault();requestClose(d);}},true);
  document.addEventListener('click',event=>{
    const closer=event.target.closest?.('[data-close]');
    if(closer){const d=closer.closest('dialog');if(d){event.preventDefault();requestClose(d);}return;}
    const d=event.target;
    if(!(d instanceof HTMLDialogElement)||!d.open||!d.classList.contains('modal')||d.dataset.dismiss==='manual')return;
    const r=d.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)requestClose(d);
  });

  /* ───── Phones: bottom-sheet drag handle ───── */
  const sheet=matchMedia('(max-width: 640px)');
  const showModal=HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal=function(){
    if(this.classList.contains('modal')&&!this.querySelector(':scope > .sheet-handle')){const h=document.createElement('div');h.className='sheet-handle';h.setAttribute('aria-hidden','true');this.prepend(h);}
    return showModal.apply(this,arguments);
  };
  let drag=null;
  document.addEventListener('pointerdown',event=>{
    if(!sheet.matches)return;const handle=event.target.closest?.('.sheet-handle');if(!handle)return;
    const d=handle.closest('dialog');if(!d||!d.open||d.dataset.dismiss==='manual')return;
    drag={d,id:event.pointerId,y:event.clientY,dy:0};try{handle.setPointerCapture(event.pointerId);}catch{}d.style.transition='none';
  });
  document.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;drag.dy=Math.max(0,event.clientY-drag.y);drag.d.style.transform=`translateY(${drag.dy}px)`;});
  const endDrag=async event=>{
    if(!drag||event.pointerId!==drag.id)return;const {d,dy}=drag;drag=null;
    d.style.transition='transform .2s cubic-bezier(.2,.8,.2,1)';
    if(dy>90&&await requestClose(d)){d.style.transform='';d.style.transition='';return;}
    d.style.transform='';setTimeout(()=>{d.style.transition='';},220);
  };
  document.addEventListener('pointerup',endDrag);document.addEventListener('pointercancel',endDrag);

  window.DS={toast,confirm,requestClose,alert:message=>toast(message)};
})();
