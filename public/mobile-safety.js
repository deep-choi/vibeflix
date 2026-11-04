// Account and community controls shared by the website and Android app.
(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Terms consent is asked at sign-up / first login (see community.js), not on every sign-in.
  const dialog = document.createElement('dialog');
  dialog.className = 'modal modal-sm community-dialog';
  dialog.setAttribute('aria-labelledby', 'safety-title');
  document.body.append(dialog);
  const toast = message => window.DS ? window.DS.toast(message) : alert(message);
  async function api(payload) {
    const response = await fetch('/api/safety', {method: payload ? 'POST' : 'GET', headers: payload ? {'Content-Type':'application/json'} : {}, ...(payload ? {body:JSON.stringify(payload)} : {})});
    const result = await response.json();
    if (!response.ok) throw Error(result.error || '요청을 처리하지 못했습니다.');
    return result;
  }
  // One dialog for every member tool: title, content, an error line and the shared footer (close + action).
  function open(title, content, submit) {
    dialog.innerHTML = `<button class="modal-close" aria-label="닫기" data-close></button><form><h2 id="safety-title">${esc(title)}</h2><div class="safety-body">${content}</div><p class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="btn" data-close>닫기</button>${submit ? `<button type="submit" class="btn primary${submit.danger ? ' danger' : ''}">${esc(submit.label)}</button>` : ''}</div></form>`;
    dialog.toggleAttribute('data-guard-unsaved', !!submit && /textarea/.test(content));
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const button = dialog.querySelector('button[type=submit]');
      button.disabled = true;
      try { await submit.action(new FormData(event.target)); dialog.close(); }
      catch (error) { const p=dialog.querySelector('[role=alert]'); p.hidden=false; p.textContent=error.message; }
      finally { button.disabled=false; }
    };
    dialog.showModal();
  }
  const reload = () => location.reload();
  const REPORT_FORM = '<label>어떤 문제인가요?<select name="category"><option value="spam">스팸·광고</option><option value="abuse">욕설·괴롭힘</option><option value="copyright">도용·저작권 침해</option><option value="privacy">개인정보 노출</option><option value="sexual">음란·선정적인 내용</option><option value="malicious">악성 링크·사기</option><option value="other">기타 (사유 필수)</option></select></label><label>자세한 내용<textarea name="reason" maxlength="500" placeholder="‘기타’를 고르면 5자 이상 적어주세요."></textarea></label>';
  function enhance() {
    document.querySelectorAll('[data-report-review-user], [data-block-review-user]').forEach(button => {
      if (button.dataset.safetyEnhanced) return;
      button.dataset.safetyEnhanced = '1';
      if (button.dataset.reportReviewUser) button.onclick = () => open('리뷰 작성자 신고', REPORT_FORM, {label:'신고 접수',action:async data=>{await api({action:'report-user',publicId:button.dataset.reportReviewUser,category:data.get('category'),reason:data.get('reason')});toast('이용자 신고가 접수되었습니다. 운영자가 확인할게요.');}});
      else button.onclick = () => open('작성자를 차단할까요?', '<p class="modal-desc">이 이용자의 콘텐츠와 알림을 숨깁니다. 내 프로필에서 해제할 수 있습니다.</p>', {label:'차단하기',danger:true,action:async()=>{await api({action:'block',publicId:button.dataset.blockReviewUser});reload();}});
    });
    document.querySelectorAll('[data-report-kind]').forEach(button => {
      if (button.dataset.safetyEnhanced) return;
      button.dataset.safetyEnhanced = '1';
      const actions = document.createElement('span');
      actions.innerHTML = '<button type="button" class="text-button" data-member-report>작성자 신고</button><button type="button" class="text-button" data-member-block>작성자 차단</button>';
      const target = {kind:button.dataset.reportKind,targetId:button.dataset.reportId};
      actions.querySelector('[data-member-report]').onclick = () => open('작성자 신고', REPORT_FORM, {label:'신고 접수',action:async data => {await api({...target,action:'report-user',category:data.get('category'),reason:data.get('reason')}); toast('이용자 신고가 접수되었습니다. 운영자가 확인할게요.');}});
      actions.querySelector('[data-member-block]').onclick = () => open('작성자를 차단할까요?', '<p class="modal-desc">이 이용자의 작품·게시글·댓글·리뷰와 알림을 숨깁니다. 내 프로필에서 차단을 해제할 수 있습니다.</p>', {label:'차단하기',danger:true,action:async()=>{await api({...target,action:'block'});reload();}});
      button.after(actions);
    });
    const footer = $('#profile-signout')?.parentElement;
    if (!footer || $('#profile-content [data-safety-controls]')) return;
    const controls = document.createElement('div');
    controls.dataset.safetyControls = '1';
    controls.className = 'safety-controls';
    controls.innerHTML = '<button class="text-button" data-consent>이용약관 동의</button><button class="text-button" data-blocks>차단 관리</button><button class="text-button danger" data-delete>계정 삭제 요청</button>';
    footer.before(controls);
    controls.querySelector('[data-consent]').onclick = () => open('이용약관 동의', '<p class="modal-desc">불법·음란·혐오·도배 및 타인의 권리를 침해하는 콘텐츠는 등록할 수 없습니다.</p><p><a href="/terms" target="_blank" rel="noopener">이용약관</a> · <a href="/privacy" target="_blank" rel="noopener">개인정보처리방침</a></p><label><input type="checkbox" name="accepted" required> 내용을 확인했고 동의합니다.</label>', {label:'동의하기',action:async data=>{await api({action:'accept',accepted:data.get('accepted')==='on'});}});
    controls.querySelector('[data-blocks]').onclick = async () => {
      try {
        const result=await api();
        open('차단 관리', result.blocks.length ? `<ul class="safety-list">${result.blocks.map(u=>`<li><span>${esc(u.name)}</span><button type="button" class="btn small" data-unblock="${esc(u.id)}">차단 해제</button></li>`).join('')}</ul>` : '<p class="modal-desc">차단한 이용자가 없습니다.</p>');
        dialog.querySelectorAll('[data-unblock]').forEach(b=>b.onclick=async()=>{try{await api({action:'unblock',publicId:b.dataset.unblock});b.closest('li').remove();}catch(e){toast(e.message);}});
      } catch(error) {toast(error.message);}
    };
    controls.querySelector('[data-delete]').onclick = () => open('계정 삭제 요청', '<p class="modal-desc">회원 프로필과 작성한 작품·게시글·댓글·리뷰, 찜·팔로우·로그인 정보를 운영자가 확인 후 삭제합니다. 삭제 후 복구할 수 없습니다.</p><p><a href="/account-deletion" target="_blank" rel="noopener">삭제 범위 및 문의 방법</a></p><label>확인을 위해 ‘삭제 요청’을 입력해주세요.<input name="confirm" required pattern="삭제 요청" autocomplete="off"></label>', {label:'삭제 요청 접수',danger:true,action:async data=>{const result=await api({action:'deletion',confirm:data.get('confirm')});toast(result.message);}});
  }
  new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
  enhance();
  if (new URLSearchParams(location.search).has('account-deletion')) $('#profile-button')?.click();
})();
