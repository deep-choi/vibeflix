'use strict';
// "You are leaving VIBEFLIX" confirmation for member-submitted links an operator has not checked yet.
// Any <a data-leave-guard href="https://…" target="_blank"> is intercepted (capture phase, so click stats only count
// when the visitor actually goes). Confirming opens the link and fires `vibe:leave` with the anchor for trackers.
(function(){
  const SKIP_KEY='vibeflix.leave-ok';
  const skipped=()=>{try{return new Set(JSON.parse(sessionStorage.getItem(SKIP_KEY)||'[]'));}catch{return new Set();}};
  const remember=host=>{try{const s=skipped();s.add(host);sessionStorage.setItem(SKIP_KEY,JSON.stringify([...s]));}catch{}};
  let dialog=null,pending=null;
  const CSS='.leave-guard{max-width:440px;width:calc(100% - 32px);padding:0;border:1px solid #ffffff1f;border-radius:14px;background:#141614;color:#eef0e8}.leave-guard::backdrop{background:#000000b3}.leave-guard form{padding:24px;display:grid;gap:12px}.leave-guard h2{margin:0;font-size:20px;letter-spacing:-.4px;color:#fff}.leave-guard p{margin:0;color:#b9beb2;font-size:14px;line-height:1.6}.leave-kicker{font-size:11px;font-weight:700;letter-spacing:1px;color:#ffc46b}.leave-host{padding:10px 12px;border-radius:8px;background:#0b0c0b;border:1px solid #ffffff14;color:#fff!important;font-family:ui-monospace,Menlo,monospace;font-size:13px!important;word-break:break-all}.leave-guard .leave-skip{display:flex!important;flex-direction:row!important;align-items:center;justify-content:flex-start;gap:8px;margin:0;color:#9aa192;font-size:13px;font-weight:500}.leave-guard .leave-skip input{flex:none;width:16px!important;height:16px;min-height:0;margin:0;padding:0;accent-color:#c3f568}.leave-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}.leave-actions button{min-height:42px;padding:0 18px;border-radius:999px;border:1px solid #ffffff24;background:#ffffff10;color:#fff;font-weight:700;cursor:pointer}.leave-actions .leave-go{background:var(--lime);border-color:var(--lime);color:#111}';
  function build(){
    const style=document.createElement('style');style.textContent=CSS;document.head.append(style);
    dialog=document.createElement('dialog');dialog.className='leave-guard';dialog.setAttribute('aria-labelledby','leave-guard-title');
    dialog.innerHTML='<form method="dialog"><span class="leave-kicker">외부 사이트로 이동</span><h2 id="leave-guard-title">VIBEFLIX 밖으로 나가요</h2><p>회원이 올린 링크로, 운영자가 아직 확인하지 않았어요. 주소를 확인하고 이동해주세요. 개인정보나 결제 정보를 요구하면 입력하지 마세요.</p><p class="leave-host"></p><label class="leave-skip"><input type="checkbox" name="skip"> 이번 방문 동안 이 사이트는 다시 묻지 않기</label><div class="leave-actions"><button value="cancel" class="leave-cancel">취소</button><button value="go" class="leave-go">이동하기 ↗</button></div></form>';
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
