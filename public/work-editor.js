'use strict';
// 작품 올리기 / 수정 (/works/new, /works/:id/edit). The server renders the form; this adds what depends on the
// category (link rules, genres, detail fields), the cover and body editors, and saving. Config: #editor-config.
(function(){
  const {$,esc,toast,flash,guard}=window.Social;
  const cfg=JSON.parse($('#editor-config').textContent);
  const form=$('#work-form'),work=cfg.work,editId=cfg.id||'';
  const unsaved=guard(form);
  const COVER={width:1280,height:720,types:['image/png','image/jpeg','image/webp']};
  const field=name=>form.elements.namedItem(name);

  /* ───── Links ───── */
  function validUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
  function normalizeUrl(value){const v=String(value||'').trim();return /^[a-z][a-z0-9+.-]*:/i.test(v)?v:v?`https://${v}`:'';}
  function publicUrlError(value){const href=validUrl(value);if(!href)return '올바른 주소를 입력해주세요. (예: www.example.com)';const host=new URL(href).hostname.toLowerCase();return (host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||!host.includes('.')||host.startsWith('[')||/^\d{1,3}(\.\d{1,3}){3}$/.test(host))?'누구나 접속할 수 있는 공개 주소만 등록할 수 있어요.':'';}
  // The link field changes meaning per category: sites/games need it, apps need it or a store link, videos need YouTube/Vimeo.
  const linkRules={
    website:{label:'작품 링크',required:true,placeholder:'www.your-project.com 또는 https://your-project.com',hint:''},
    game:{label:'플레이 링크',required:true,placeholder:'https://your-game.com',hint:'방문자가 바로 플레이할 수 있는 주소예요.'},
    app:{label:'웹 링크',required:false,placeholder:'https://your-app.com',hint:'웹 링크나 세부 정보의 스토어 링크 중 하나는 꼭 필요해요.'},
    video:{label:'영상 링크 (YouTube · Vimeo)',required:true,placeholder:'https://youtu.be/... 또는 https://vimeo.com/...',hint:'상세 페이지에서 바로 재생돼요.'},
    art:{label:'외부 링크',required:false,placeholder:'https:// (선택)',hint:'다른 곳에도 올렸다면 넣어주세요. 그림은 아래 본문에 올리면 돼요.'},
    novel:{label:'외부 링크',required:false,placeholder:'https:// (선택)',hint:'다른 곳에 연재 중이면 넣어주세요. 글은 아래 본문에 쓰면 돼요.'},
  };
  // Creators can announce a work that is still being built: no link yet, launch alerts when it goes live
  function syncStatus(){
    const upcoming=field('status').value==='upcoming';const url=field('url');const rule=linkRules[field('type').value]||linkRules.website;
    url.required=rule.required&&!upcoming;$('#url-required').hidden=!url.required;$('#status-hint').hidden=!upcoming;
  }
  $('#work-status').addEventListener('change',syncStatus);

  /* ───── Genres (max 3, per category) ───── */
  let genres=new Set(work?.genres||[]);
  function renderGenres(){
    const box=$('#work-genres');const list=cfg.genres[field('type').value]||[];
    for(const g of genres)if(!list.includes(g))genres.delete(g);
    box.innerHTML=list.map(g=>`<button type="button" class="genre-chip${genres.has(g)?' selected':''}" data-genre="${esc(g)}" aria-pressed="${genres.has(g)}">${esc(g)}</button>`).join('');
    box.closest('.genre-field').hidden=!list.length;
  }
  $('#work-genres').addEventListener('click',event=>{const chip=event.target.closest('[data-genre]');if(!chip)return;const g=chip.dataset.genre;if(genres.has(g))genres.delete(g);else if(genres.size>=3){toast('장르는 3개까지 고를 수 있어요.');return;}else genres.add(g);renderGenres();});

  /* ───── Category fields ───── */
  const bodyHints={website:'스크린샷과 설명을 번갈아 넣으면 상세 페이지가 읽기 좋아져요.',app:'앱 화면 스크린샷과 기능 설명을 넣어보세요.',game:'플레이 화면 스크린샷과 게임 이야기를 넣어보세요.',art:'그림을 순서대로 올리면 세로로 이어서 보여요. 웹툰·만화는 컷 순서대로 올려주세요.',video:'제작 과정, 크레딧, 비하인드를 적어보세요.',novel:'회차마다 ‘소제목’을 넣고 그 아래에 ‘글’을 이어서 쓰세요.'};
  const detailField=(label,control,hint='')=>`<label class="detail-input"><span>${label}${hint?` <small>${hint}</small>`:''}</span>${control}</label>`;
  const sel=(name,options,value)=>`<select name="${name}">${options.map(([v,l])=>`<option value="${v}" ${v===value?'selected':''}>${l}</option>`).join('')}</select>`;
  const checks=(name,options,selected=[])=>`<div class="detail-checks">${options.map(([k,l])=>`<label><input type="checkbox" name="${name}" value="${k}" ${selected.includes(k)?'checked':''}> ${l}</label>`).join('')}</div>`;
  const WARNING_OPTIONS=[['violence','폭력'],['horror','공포'],['language','거친 언어'],['mature','성인 소재'],['flashing','깜빡이는 화면']];
  function renderDetails(type,d={}){
    const v=k=>esc(Array.isArray(d[k])?d[k].join(k==='features'?'\n':', '):d[k]||'');
    const m=d.making||{};const mv=k=>esc(Array.isArray(m[k])?m[k].join(', '):m[k]||'');
    const formField=label=>detailField(label,sel('d_form',[['','선택'],['single','단편'],['serial',type==='video'?'시리즈':'연재']],d.form||''),'연재·시리즈는 등록 후 작품 페이지에서 회차를 올려요');
    // serials say which days new parts come out ("매주 수·토 연재")
    const schedule=`<div class="detail-input"><span>연재 요일 <small>연재·시리즈일 때 · 작품 페이지와 회차 끝에 안내돼요</small></span>${checks('d_schedule',[['mon','월'],['tue','화'],['wed','수'],['thu','목'],['fri','금'],['sat','토'],['sun','일']],d.schedule||[])}</div>`;
    const warnings=`<div class="detail-input"><span>소재 경고 <small>해당하면 선택 · 작품 페이지 위에 안내돼요</small></span>${checks('d_warnings',WARNING_OPTIONS,d.warnings||[])}</div>`;
    const html={
      website:detailField('주요 기능',`<textarea name="d_features" rows="3" maxlength="420" placeholder="한 줄에 하나씩, 최대 5개">${v('features')}</textarea>`)+detailField('사용 기술',`<input name="d_stack" maxlength="260" placeholder="예: React, Supabase, Tailwind" value="${v('stack')}">`,'쉼표로 구분 · 웹사이트 페이지에서 기술로 찾을 수 있어요'),
      app:detailField('사용 기술',`<input name="d_stack" maxlength="260" placeholder="예: Flutter, Firebase" value="${v('stack')}">`,'쉼표로 구분 · 포트폴리오로 쓸 때 도움이 돼요')+`<div class="detail-input"><span>플랫폼</span>${checks('d_platforms',[['ios','iOS'],['android','Android'],['web','웹']],d.platforms||[])}</div>`+detailField('App Store 링크',`<input name="d_appStore" maxlength="2000" placeholder="https://apps.apple.com/..." value="${v('appStore')}">`)+detailField('Google Play 링크',`<input name="d_playStore" maxlength="2000" placeholder="https://play.google.com/..." value="${v('playStore')}">`)+`<div class="form-pair">${detailField('가격',sel('d_price',[['','선택'],['free','무료'],['paid','유료'],['iap','무료 · 앱 내 결제']],d.price||''))}<div class="detail-input"><span>베타 테스터</span>${checks('d_beta',[['on','모집 중']],d.beta?['on']:[])}</div></div>`+detailField('베타 참여 링크',`<input name="d_betaUrl" maxlength="2000" placeholder="TestFlight·Play 테스트 링크 (선택)" value="${v('betaUrl')}">`),
      game:detailField('사용 기술',`<input name="d_stack" maxlength="260" placeholder="예: Phaser, Three.js, Godot" value="${v('stack')}">`,'쉼표로 구분')+`<div class="form-pair">${detailField('개발 단계',sel('d_stage',[['','선택'],['demo','데모'],['early','얼리 액세스'],['release','정식 출시']],d.stage||''))}${detailField('플레이 방식',sel('d_playMode',[['','선택'],['browser','브라우저에서 바로'],['download','다운로드 설치'],['mobile','모바일']],d.playMode||''))}</div><div class="detail-input"><span>조작 장치</span>${checks('d_inputs',[['keyboard','키보드'],['mouse','마우스'],['gamepad','게임패드'],['touch','터치']],d.inputs||[])}</div>`+detailField('플레이 시간',`<input name="d_playtime" maxlength="30" placeholder="예: 10~20분" value="${v('playtime')}">`)+detailField('조작법',`<textarea name="d_controls" rows="3" maxlength="500" placeholder="예: WASD 이동 · 마우스 조준 · 스페이스 점프">${v('controls')}</textarea>`)+detailField('트레일러 링크',`<input name="d_trailer" maxlength="2000" placeholder="YouTube 또는 Vimeo (선택)" value="${v('trailer')}">`)+detailField('itch.io 임베드 주소',`<input name="d_embed" maxlength="2000" placeholder="https://itch.io/embed-upload/... (선택)" value="${v('embed')}">`,'넣으면 작품 페이지에서 바로 플레이할 수 있어요')+warnings,
      art:`<div class="form-pair">${detailField('형식',sel('d_format',[['','선택'],['illustration','일러스트'],['webtoon','웹툰 (세로 스크롤)'],['comic','만화']],d.format||''))}${formField('연재 여부')}</div>`+schedule+detailField('라이선스',sel('d_license',[['','선택'],['all-rights','모든 권리 보유 · 무단 사용 금지'],['cc-by','CC BY · 출처 표시'],['cc-by-nc','CC BY-NC · 비상업적 이용'],['cc0','CC0 · 자유 이용']],d.license||''))+warnings,
      video:`<div class="form-pair">${detailField('길이',`<input name="d_duration" maxlength="20" placeholder="예: 3분 20초" value="${v('duration')}">`)}${formField('형식')}</div>`+schedule+detailField('챕터',`<textarea name="d_chapters" rows="3" maxlength="2000" placeholder="0:00 인트로&#10;1:20 본편">${v('chapters')}</textarea>`,'한 줄에 하나씩')+detailField('크레딧',`<textarea name="d_credits" rows="3" maxlength="1000" placeholder="출연, 음악, 사용한 AI 도구 등">${v('credits')}</textarea>`)+warnings,
      novel:`<div class="form-pair">${formField('형식')}${detailField('연재 상태',sel('d_status',[['','선택'],['ongoing','연재 중'],['complete','완결']],d.status||''))}</div>`+schedule+warnings,
    }[type]||'';
    // How it was made with AI — shared by every category
    const dev=['website','app','game'].includes(type);
    const toolExamples={art:'예: Midjourney, Stable Diffusion, ChatGPT',video:'예: Runway, Sora, Suno',novel:'예: ChatGPT, Claude, Novel AI'}[type]||'예: Claude, Cursor, Lovable';
    const making=`<div class="making-fields"><span class="cover-label">AI로 만든 과정 <small>선택 · 작품 페이지에 따로 소개돼요</small></span><div class="form-pair">${detailField('사용한 AI 도구',`<input name="m_tools" maxlength="260" placeholder="${toolExamples}" value="${mv('tools')}">`,'쉼표로 구분')}${detailField('제작 기간',`<input name="m_days" maxlength="30" placeholder="예: 3일" value="${mv('days')}">`)}</div>${detailField('만든 과정',`<textarea name="m_process" rows="3" maxlength="2000" placeholder="어떤 아이디어로 시작해서, AI와 어떻게 만들었는지 들려주세요.">${mv('process')}</textarea>`)}${dev?`<div class="form-pair">${detailField('GitHub 링크',`<input name="m_github" maxlength="2000" placeholder="https://github.com/... (선택)" value="${mv('github')}">`)}<div class="detail-input"><span>소스 공개</span>${checks('m_openSource',[['on','오픈소스예요']],m.openSource?['on']:[])}</div></div>`:''}</div>`
      +detailField('함께 만든 사람',`<textarea name="d_team" rows="2" maxlength="620" placeholder="한 줄에 한 명 · 예: 하늘 · 그림&#10;바다 · 음악">${esc((d.team||[]).join('\n'))}</textarea>`,'선택 · 팀이나 스튜디오라면 함께 적어주세요');
    $('#work-details').innerHTML=html+making;
    const rule=linkRules[type]||linkRules.website;const url=field('url');
    $('#url-label').textContent=rule.label;url.placeholder=rule.placeholder;$('#url-hint').textContent=rule.hint;syncStatus();
    bodyEditor.setHint(bodyHints[type]||'');
  }
  function gatherDetails(){
    const out={},making={};const many=['platforms','inputs','warnings','schedule'];
    for(const [k,val] of new FormData(form).entries()){
      if(k.startsWith('m_')){making[k.slice(2)]=String(val).trim();continue;}
      if(!k.startsWith('d_'))continue;const key=k.slice(2);
      if(many.includes(key)){(out[key]||=[]).push(val);continue;}out[key]=String(val).trim();
    }
    if(out.features)out.features=out.features.split('\n').map(x=>x.trim()).filter(Boolean);
    if(out.stack)out.stack=out.stack.split(',').map(x=>x.trim()).filter(Boolean);
    if(making.tools)making.tools=making.tools.split(',').map(x=>x.trim()).filter(Boolean);
    if(out.team)out.team=out.team.split('\n').map(x=>x.trim()).filter(Boolean);
    out.making=making;
    return out;
  }
  const bodyEditor=window.BlockEditor.create($('#content-editor'));
  field('type').addEventListener('change',event=>{renderGenres();renderDetails(event.target.value,gatherDetails());});

  /* ───── Intro ───── */
  const introTemplates={
    website:'무엇을 만들었나요: \n누구에게 좋은가요: \n어떻게 만들었나요 (AI 도구 · 걸린 시간): \n써보면 좋은 기능: ',
    app:'무엇을 하는 앱인가요: \n누구에게 필요할까요: \n어떻게 만들었나요 (AI 도구 · 걸린 시간): \n설치 방법: ',
    game:'어떤 게임인가요: \n이렇게 플레이해요: \n어떻게 만들었나요 (AI 도구 · 걸린 시간): \n받고 싶은 피드백: ',
    art:'어떤 그림·만화인가요: \n이야기나 분위기: \n어떻게 만들었나요 (AI 도구 · 과정): ',
    video:'어떤 영상인가요: \n보면 좋은 사람: \n어떻게 만들었나요 (AI 도구 · 과정): ',
    novel:'어떤 이야기인가요: \n주인공과 배경: \n연재 계획: \n어떻게 만들었나요 (AI 도구 · 과정): ',
  };
  const description=$('#work-description');
  const updateCount=()=>{$('#description-count').textContent=description.value.length.toLocaleString('ko-KR');};
  description.addEventListener('input',updateCount);
  $('#intro-template').addEventListener('click',()=>{
    if(description.value.trim()){toast('이미 쓴 소개가 있어서 틀을 넣지 않았어요.');return;}
    description.value=introTemplates[field('type').value]||introTemplates.website;updateCount();unsaved.mark();description.focus();const at=description.value.indexOf(': ')+2;description.setSelectionRange(at,at);
  });

  /* ───── Cover ───── */
  let cover={mode:'keep',data:''};
  function setCover(mode,data,existing){
    cover={mode,data};const preview=$('#cover-preview');const img=$('img',preview);
    const src=mode==='new'?data:mode==='keep'?(existing||''):'';
    preview.hidden=!src;if(src)img.src=src;else img.removeAttribute('src');
    $('#cover-info').textContent=mode==='new'?`${COVER.width} × ${COVER.height}px · ${Math.round(data.length*0.75/1024)}KB`:mode==='keep'&&src?'현재 등록된 커버 이미지':'';
    $('#cover-clear').hidden=!src;$('#cover-pick').textContent=src?'다른 이미지 선택':'내 컴퓨터에서 이미지 선택';$('#cover-file').value='';
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
    const data=new FormData(form);const payload=Object.fromEntries(data);$('#form-error').hidden=true;
    for(const key of Object.keys(payload))if(key.startsWith('d_')||key.startsWith('m_'))delete payload[key];payload.details=gatherDetails();
    const urlField=field('url');payload.url=payload.url.trim()?normalizeUrl(payload.url):'';const urlProblem=payload.url||urlField.required?publicUrlError(payload.url):'';
    if(urlProblem){urlField.setCustomValidity(urlProblem);urlField.reportValidity();urlField.addEventListener('input',()=>urlField.setCustomValidity(''),{once:true});return;}
    const content=bodyEditor.get();if(!content)return;payload.content=content;payload.draft=draft;
    if(cover.mode==='new')payload.image=cover.data;else if(cover.mode==='remove')payload.image='';
    payload.genres=[...genres];
    for(const name of ['title','creator','description']){const el=field(name);if(!String(data.get(name)).trim()){el.setCustomValidity('공백 이외의 내용을 입력해주세요.');el.reportValidity();el.addEventListener('input',()=>el.setCustomValidity(''),{once:true});return;}}
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
  renderGenres();renderDetails(field('type').value,work?.details||{});updateCount();
  setCover('keep','',work?.image||'');
  if(work)bodyEditor.set(work.content||[]);
})();
