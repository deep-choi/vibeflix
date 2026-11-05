'use strict';
// 작품 올리기 / 수정 (/works/new, /works/:id/edit): a name, a kind, a link and one free-writing section.
// Config: #editor-config. The first block of the writing section is the work's 소개 (description); anything after it is the body.
// Details saved earlier (tech, AI tools, play mode, …) are kept as they are: this page no longer asks for them.
(function(){
  const {$,esc,toast,flash,guard}=window.Social;
  const cfg=JSON.parse($('#editor-config').textContent);
  const form=$('#work-form'),work=cfg.work,editId=cfg.id||'';
  const unsaved=guard(form);
  const COVER={width:1280,height:720,types:['image/png','image/jpeg','image/webp']};
  const field=name=>form.elements.namedItem(name);
  const baseDetails=work?.details&&typeof work.details==='object'&&!Array.isArray(work.details)?{...work.details}:{};
  const INTRO_MAX=1000;

  /* ───── Links ───── */
  function validUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
  function normalizeUrl(value){const v=String(value||'').trim();return /^[a-z][a-z0-9+.-]*:/i.test(v)?v:v?`https://${v}`:'';}
  function publicUrlError(value){const href=validUrl(value);if(!href)return '올바른 주소를 입력해주세요. (예: www.example.com)';const host=new URL(href).hostname.toLowerCase();return (host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||!host.includes('.')||host.startsWith('[')||/^\d{1,3}(\.\d{1,3}){3}$/.test(host))?'누구나 접속할 수 있는 공개 주소만 등록할 수 있어요.':'';}
  // The link means something different per kind: sites, games and apps need one, videos need YouTube/Vimeo.
  const linkRules={
    website:{label:'작품 링크',required:true,placeholder:'www.your-project.com 또는 https://your-project.com',hint:''},
    game:{label:'플레이 링크',required:true,placeholder:'https://your-game.com',hint:'방문자가 바로 플레이할 수 있는 주소예요.'},
    app:{label:'앱 링크',required:true,placeholder:'https://your-app.com 또는 스토어 주소',hint:'웹 주소나 App Store · Google Play 주소를 넣어주세요.'},
    video:{label:'영상 링크 (YouTube · Vimeo)',required:true,placeholder:'https://youtu.be/... 또는 https://vimeo.com/...',hint:'작품 페이지에서 바로 재생돼요.'},
    art:{label:'외부 링크 (선택)',required:false,placeholder:'https://',hint:''},
    novel:{label:'외부 링크 (선택)',required:false,placeholder:'https://',hint:''},
  };
  function syncLink(){
    const type=field('type').value,rule=linkRules[type]||linkRules.website,upcoming=$('#work-upcoming').checked,url=field('url');
    // an app saved earlier with only store links keeps working without a web link
    const storeOnly=type==='app'&&!!(baseDetails.appStore||baseDetails.playStore);
    url.required=rule.required&&!upcoming&&!storeOnly;
    $('#url-label').textContent=rule.label;url.placeholder=rule.placeholder;$('#url-hint').textContent=rule.hint;$('#url-hint').hidden=!rule.hint;$('#url-required').hidden=!url.required;
  }
  $('#work-upcoming').addEventListener('change',syncLink);

  /* ───── Genres (max 3, per kind) ───── */
  let genres=new Set(work?.genres||[]);
  function renderGenres(){
    const box=$('#work-genres');const list=cfg.genres[field('type').value]||[];
    for(const g of genres)if(!list.includes(g))genres.delete(g);
    box.innerHTML=list.map(g=>`<button type="button" class="genre-chip${genres.has(g)?' selected':''}" data-genre="${esc(g)}" aria-pressed="${genres.has(g)}">${esc(g)}</button>`).join('');
    box.closest('.genre-field').hidden=!list.length;
  }
  $('#work-genres').addEventListener('click',event=>{const chip=event.target.closest('[data-genre]');if(!chip)return;const g=chip.dataset.genre;if(genres.has(g))genres.delete(g);else if(genres.size>=3){toast('장르는 3개까지 고를 수 있어요.');return;}else genres.add(g);renderGenres();});
  field('type').addEventListener('change',()=>{renderGenres();syncLink();});

  /* ───── The writing section: one text area, with photos and videos to add below ───── */
  const bodyEditor=window.BlockEditor.create($('#content-editor'),{kinds:['text','image','video'],lockFirst:true,firstPlaceholder:'어떤 작품인가요? 어떻게 만들었나요? 편하게 써주세요.\n\n예) 퇴근길에 쓰려고 Claude와 이틀 동안 만든 일정 앱이에요. 이런 분께 좋아요…'});
  /** The 소개 is capped at 1,000 characters: a longer text is cut at the last paragraph or sentence that fits, and the rest becomes the first body block. */
  function splitIntro(text){
    const t=text.trim();if(t.length<=INTRO_MAX)return [t,''];
    const head=t.slice(0,INTRO_MAX);let cut=0;
    for(const [mark,size] of [['\n\n',2],['\n',1],['. ',2],['다.',2],['요.',2],['? ',2],['! ',2],[' ',1]]){const i=head.lastIndexOf(mark);if(i>=0)cut=Math.max(cut,i+size);}
    if(cut<INTRO_MAX/2)cut=INTRO_MAX;
    return [t.slice(0,cut).trim(),t.slice(cut).trim()];
  }

  /* ───── Cover ───── */
  let cover={mode:'keep',data:''};
  function setCover(mode,data,existing){
    cover={mode,data};const preview=$('#cover-preview');const img=$('img',preview);
    const src=mode==='new'?data:mode==='keep'?(existing||''):'';
    preview.hidden=!src;if(src)img.src=src;else img.removeAttribute('src');
    $('#cover-info').textContent=mode==='new'?`${COVER.width} × ${COVER.height}px · ${Math.round(data.length*0.75/1024)}KB`:src?'현재 등록된 커버 이미지':'16:9로 잘라 카드와 작품 페이지 맨 위에 보여줘요.';
    $('#cover-clear').hidden=!src;$('#cover-pick').textContent=src?'다른 이미지':'이미지 선택';$('#cover-file').value='';
  }
  function coverError(message){const el=$('#cover-error');el.textContent=message||'';el.hidden=!message;}
  $('#cover-pick').addEventListener('click',()=>$('#cover-file').click());
  $('#cover-clear').addEventListener('click',()=>{coverError('');setCover('remove','');});
  $('#cover-file').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;coverError('');
    if(!COVER.types.includes(file.type))return coverError('PNG, JPG, WebP 형식의 이미지만 올릴 수 있어요.');
    try{setCover('new',await window.BlockEditor.prepareCover(file));unsaved.mark();}catch{coverError('이미지를 처리하지 못했어요. 다른 이미지를 골라주세요.');}
  });

  /* ───── Saving ───── */
  let submitting=false,draftSubmit=false;
  $('#save-draft')?.addEventListener('click',()=>{draftSubmit=true;form.requestSubmit();});
  const submitLabel=$('#work-submit').innerHTML;
  const showError=message=>{const el=$('#form-error');el.textContent=message;el.hidden=false;el.scrollIntoView({behavior:'smooth',block:'center'});};
  form.addEventListener('submit',async event=>{
    event.preventDefault();const draft=draftSubmit;draftSubmit=false;if(submitting)return;
    $('#form-error').hidden=true;
    const titleField=field('title'),title=titleField.value.trim();
    if(!title){titleField.setCustomValidity('공백 이외의 내용을 입력해주세요.');titleField.reportValidity();titleField.addEventListener('input',()=>titleField.setCustomValidity(''),{once:true});return;}
    const urlField=field('url'),raw=urlField.value.trim(),url=raw?normalizeUrl(raw):'';
    const urlProblem=url||urlField.required?publicUrlError(url):'';
    if(urlProblem){urlField.setCustomValidity(urlProblem);urlField.reportValidity();urlField.addEventListener('input',()=>urlField.setCustomValidity(''),{once:true});return;}
    const blocks=bodyEditor.get();if(!blocks)return;
    const [first,...rest]=blocks;const intro=first&&first.type==='text'?String(first.text||'').trim():'';
    if(!intro){showError('작품 소개를 써주세요. 한두 줄이어도 괜찮아요.');return;}
    const [description,tail]=splitIntro(intro);
    // saved details (including a content warning an operator or an older version set) go back exactly as they were
    const type=field('type').value,details={...baseDetails};
    const payload={title,type,url,description,creator:cfg.creator,status:$('#work-upcoming').checked?'upcoming':'live',genres:[...genres],details,content:[...(tail?[{type:'text',text:tail}]:[]),...rest],draft};
    if(cover.mode==='new')payload.image=cover.data;else if(cover.mode==='remove')payload.image='';
    submitting=true;const button=$('#work-submit');button.disabled=true;button.textContent='저장하는 중…';
    try{
      const response=await fetch(editId?`/api/projects/${encodeURIComponent(editId)}`:'/api/projects',{method:editId?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const result=await response.json().catch(()=>({}));
      // keep the page (and everything typed) when the session ran out: signing in happens in another tab
      if(response.status===401)throw Error('로그인이 끝났어요. 새 탭에서 다시 로그인한 뒤 이 화면에서 저장해주세요.');
      if(!response.ok)throw Error(result.error||'등록에 실패했어요. 잠시 후 다시 시도해주세요.');
      const id=editId||result.project.id;
      if(draft&&editId){unsaved.clean();toast('임시 저장했어요.');return;}
      unsaved.clean();
      if(draft){flash('임시 저장했어요. 이어서 쓸 수 있어요.');location.replace(`/works/${encodeURIComponent(id)}/edit`);return;}
      // a first work is when feedback matters most: the work page offers a ready-to-send 피드백 요청 post
      if(result.firstWork)try{sessionStorage.setItem('vibeflix.ask-feedback',id);}catch{}
      flash(editId&&cfg.published?'작품 소개를 수정했어요.':'작품이 공개되었어요. 이제 다른 방문자도 볼 수 있어요.');location.href=`/works/${encodeURIComponent(id)}`;
    }catch(error){showError(error.message||'네트워크 연결을 확인하고 다시 시도해주세요.');}
    finally{submitting=false;button.disabled=false;button.innerHTML=submitLabel;}
  });

  /* ───── Start ───── */
  renderGenres();syncLink();
  setCover('keep','',work?.image||'');
  bodyEditor.set(work?[{type:'text',text:work.description||''},...(work.content||[])]:[]);
})();
