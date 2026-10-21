'use strict';
// Vertical body editor shared by the upload form (site) and the episode/update editor (work pages).
// Blocks: {type:'heading'|'text',text} · {type:'image',id?|data?,src,caption} · {type:'video',url}
(function(){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const LIMIT={blocks:60,images:8,bytes:700*1024,width:1600};
  const names={heading:'소제목',text:'글',image:'이미지',video:'영상'};
  const videoOk=url=>/^(https?:\/\/)?((www|m)\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/|(player\.)?vimeo\.com\/)/i.test(url.trim());

  // Downscale + re-encode in the browser so any normal photo or illustration fits the upload budget.
  async function shrinkImage(file){
    const url=URL.createObjectURL(file);
    try{
      const img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(Error('open'));el.src=url;});
      let scale=Math.min(1,LIMIT.width/img.naturalWidth,4096/img.naturalHeight);
      for(let attempt=0;attempt<6;attempt++){
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
        const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
        for(const quality of [.88,.78,.66,.55]){
          let blob=await new Promise(r=>canvas.toBlob(r,'image/webp',quality));
          if(!blob||blob.type!=='image/webp')blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));
          if(blob&&blob.size<=LIMIT.bytes)return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
        }
        scale*=.8;
      }
      throw Error('too large');
    }finally{URL.revokeObjectURL(url);}
  }
  /** Center-crops any image to 16:9 and scales it to exactly 1280×720 (the cover rule), under ~780KB. */
  async function prepareCover(file){
    const url=URL.createObjectURL(file);
    try{
      const img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(Error('open'));el.src=url;});
      const c=document.createElement('canvas');c.width=1280;c.height=720;const r=Math.max(1280/img.naturalWidth,720/img.naturalHeight),w=1280/r,h=720/r;
      const ctx=c.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,1280,720);ctx.drawImage(img,(img.naturalWidth-w)/2,(img.naturalHeight-h)/2,w,h,0,0,1280,720);
      const webp=c.toDataURL('image/webp',.9).startsWith('data:image/webp');
      for(const q of [.9,.84,.76,.68,.6,.5]){const data=c.toDataURL(webp?'image/webp':'image/jpeg',q);if(data.length*.75<=780*1024)return data;}
      throw Error('too large');
    }finally{URL.revokeObjectURL(url);}
  }

  function create(root,{hint=''}={}){
    let blocks=[];
    root.classList.add('block-editor');
    root.innerHTML=`<p class="be-hint"></p><div class="be-blocks"></div><div class="be-add"><button type="button" data-add="heading">＋ 소제목</button><button type="button" data-add="text">＋ 글</button><button type="button" data-add="image">＋ 이미지</button><button type="button" data-add="video">＋ 영상</button></div><input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden><p class="be-error" role="alert" hidden></p>`;
    const list=root.querySelector('.be-blocks'),file=root.querySelector('input[type=file]'),err=root.querySelector('.be-error'),imageButton=root.querySelector('[data-add=image]');
    const error=message=>{err.textContent=message||'';err.hidden=!message;};
    const setHint=text=>{root.querySelector('.be-hint').textContent=text||'';root.querySelector('.be-hint').hidden=!text;};
    setHint(hint);
    function render(){
      list.innerHTML=blocks.map((b,i)=>`<div class="cblock cblock-${b.type}" data-i="${i}"><div class="cblock-bar"><span>${names[b.type]}</span><button type="button" data-move="-1" aria-label="위로" ${i===0?'disabled':''}>↑</button><button type="button" data-move="1" aria-label="아래로" ${i===blocks.length-1?'disabled':''}>↓</button><button type="button" data-remove aria-label="${names[b.type]} 삭제">✕</button></div>${
        b.type==='heading'?`<input data-field="text" maxlength="100" placeholder="소제목 (예: 1화 · 시작)" value="${esc(b.text)}">`:
        b.type==='text'?`<textarea data-field="text" rows="6" maxlength="5000" placeholder="내용을 입력하세요.">${esc(b.text)}</textarea>`:
        b.type==='video'?`<input data-field="url" maxlength="2000" placeholder="YouTube 또는 Vimeo 링크" value="${esc(b.url)}">`:
        `<img src="${esc(b.src)}" alt=""><input data-field="caption" maxlength="200" placeholder="이미지 설명 (선택)" value="${esc(b.caption)}">`}</div>`).join('');
      const images=blocks.filter(b=>b.type==='image').length;imageButton.disabled=images>=LIMIT.images;imageButton.textContent=images>=LIMIT.images?`이미지 ${LIMIT.images}장 모두 사용`:'＋ 이미지';
    }
    list.addEventListener('input',event=>{const el=event.target.closest('[data-i]');if(!el||!event.target.dataset.field)return;blocks[Number(el.dataset.i)][event.target.dataset.field]=event.target.value;});
    list.addEventListener('click',event=>{const el=event.target.closest('[data-i]');if(!el)return;const i=Number(el.dataset.i);
      if(event.target.closest('[data-remove]')){blocks.splice(i,1);render();return;}
      const move=event.target.closest('[data-move]');if(move){const j=i+Number(move.dataset.move);if(j<0||j>=blocks.length)return;[blocks[i],blocks[j]]=[blocks[j],blocks[i]];render();}});
    root.querySelector('.be-add').addEventListener('click',event=>{const b=event.target.closest('[data-add]');if(!b)return;const type=b.dataset.add;
      if(type==='image'){file.click();return;}
      if(blocks.length>=LIMIT.blocks){error(`블록은 ${LIMIT.blocks}개까지 만들 수 있어요.`);return;}
      blocks.push(type==='video'?{type,url:''}:{type,text:''});render();list.querySelector('.cblock:last-child [data-field]')?.focus();});
    file.addEventListener('change',async()=>{
      const files=[...file.files];file.value='';if(!files.length)return;error('');
      const room=LIMIT.images-blocks.filter(b=>b.type==='image').length;const problems=[];
      if(files.length>room)problems.push(`이미지는 최대 ${LIMIT.images}장이라서 ${files.length-room}장은 제외했어요.`);
      imageButton.disabled=true;imageButton.textContent='이미지 최적화 중…';
      for(const f of files.slice(0,room)){
        if(!['image/png','image/jpeg','image/webp'].includes(f.type)){problems.push(`${f.name}: PNG, JPG, WebP만 올릴 수 있어요.`);continue;}
        if(f.size>20*1024*1024){problems.push(`${f.name}: 20MB 이하 이미지만 올릴 수 있어요.`);continue;}
        try{const data=await shrinkImage(f);blocks.push({type:'image',data,src:data,caption:''});}catch{problems.push(`${f.name}: 이미지를 처리하지 못했어요.`);}
      }
      render();error(problems.join(' '));
    });
    render();
    return {
      set(next){blocks=(next||[]).map(b=>b.type==='image'?{type:'image',id:b.id,data:b.data,src:b.src||b.data,caption:b.caption||''}:b.type==='video'?{type:'video',url:b.url||''}:{type:b.type,text:b.text||''});error('');render();},
      /** Blocks ready to send; returns null (and shows why) if a video link is invalid. */
      get(){
        const bad=blocks.find(b=>b.type==='video'&&b.url.trim()&&!videoOk(b.url));if(bad){error('영상 블록에는 YouTube 또는 Vimeo 링크를 넣어주세요.');return null;}
        return blocks.filter(b=>b.type!=='video'||b.url.trim()).map(b=>b.type==='image'?(b.id?{type:'image',id:b.id,caption:b.caption||''}:{type:'image',data:b.data,caption:b.caption||''}):b.type==='video'?{type:'video',url:b.url.trim()}:{type:b.type,text:b.text||''});
      },
      setHint,error,
      get length(){return blocks.length;},
    };
  }
  window.BlockEditor={create,shrinkImage,prepareCover};
})();
