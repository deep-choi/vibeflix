'use strict';
// "You are leaving VIBEFLIX" confirmation for member-submitted links an operator has not checked yet.
// Any <a data-leave-guard href="https://…" target="_blank"> is intercepted (capture phase, so click stats only count
// when the visitor actually goes). Confirming opens the link and fires `vibe:leave` with the anchor for trackers.
// The dialog uses the shared modal component (public/ds.css).
(function(){
  const SKIP_KEY='vibeflix.leave-ok';
  const skipped=()=>{try{return new Set(JSON.parse(sessionStorage.getItem(SKIP_KEY)||'[]'));}catch{return new Set();}};
  const remember=host=>{try{const s=skipped();s.add(host);sessionStorage.setItem(SKIP_KEY,JSON.stringify([...s]));}catch{}};
  let dialog=null,pending=null;
  function build(){
    dialog=document.createElement('dialog');dialog.className='modal modal-sm leave-guard';dialog.setAttribute('aria-labelledby','leave-guard-title');dialog.setAttribute('aria-describedby','leave-guard-desc');
    dialog.innerHTML='<form method="dialog"><span class="ds-kicker leave-kicker">외부 사이트로 이동</span><h2 id="leave-guard-title">VIBEFLIX 밖으로 나가요</h2><p class="modal-desc" id="leave-guard-desc">회원이 올린 링크로, 운영자가 아직 확인하지 않았어요. 주소를 확인하고 이동해주세요. 개인정보나 결제 정보를 요구하면 입력하지 마세요.</p><p class="leave-host"></p><label class="leave-skip"><input type="checkbox" name="skip"> 이번 방문 동안 이 사이트는 다시 묻지 않기</label><div class="modal-actions"><button class="btn" value="cancel">취소</button><button class="btn primary leave-go" value="go">이동하기 ↗</button></div></form>';
    document.body.append(dialog);
    dialog.addEventListener('close',()=>{
      const anchor=pending;pending=null;if(!anchor||dialog.returnValue!=='go')return;
      const url=new URL(anchor.href);if(dialog.querySelector('[name="skip"]').checked)remember(url.host);
      window.open(url.href,'_blank','noopener,noreferrer');document.dispatchEvent(new CustomEvent('vibe:leave',{detail:anchor}));
    });
  }
  document.addEventListener('click',event=>{
    const anchor=event.target.closest&&event.target.closest('a[data-leave-guard]');if(!anchor)return;
    let url;try{url=new URL(anchor.href);}catch{return;}
    if(!/^https?:$/.test(url.protocol)||url.origin===location.origin)return;
    if(skipped().has(url.host))return; // let the link open normally (its own click handlers count it)
    event.preventDefault();event.stopImmediatePropagation();
    if(!dialog)build();pending=anchor;dialog.returnValue='';
    dialog.querySelector('.leave-host').textContent=url.host+(url.pathname.length>1?url.pathname.slice(0,40):'');
    dialog.querySelector('[name="skip"]').checked=false;dialog.showModal();dialog.querySelector('.leave-go').focus();
  },true);
})();
