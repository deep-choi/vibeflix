import { getSettings } from './admin';

const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const EFFECTIVE_DATE='2026년 10월 21일';

// Legal pages share one shell; the operator's contact email comes from /admin settings.
export async function legalPage(title:string,body:(contact:string)=>string){
  const {contactEmail}=await getSettings();
  const contact=contactEmail?`<a href="mailto:${esc(contactEmail)}">${esc(contactEmail)}</a>`:'운영자 문의 이메일(준비 중)';
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#000000"><title>${title} · VIBEFLIX</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#000;color:#e8e8e8;font:15px/1.85 'DM Sans','Noto Sans KR',sans-serif;-webkit-font-smoothing:antialiased}
header{height:60px;padding:0 24px;display:flex;align-items:center;border-bottom:1px solid #ffffff14}header a{color:#c3f568;font:700 20px 'DM Sans',sans-serif;letter-spacing:-1.2px;text-decoration:none}
main{max-width:760px;margin:0 auto;padding:40px 20px 80px}h1{font-size:28px;letter-spacing:-.6px;margin:0 0 6px;color:#fff}.date{color:#8a8a8a;margin:0 0 32px}
h2{font-size:17px;margin:36px 0 10px;color:#fff}p,li{color:#cfcfcf}ul{padding-left:20px}a{color:#c3f568}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:14px}th,td{border:1px solid #ffffff1f;padding:9px 12px;text-align:left;vertical-align:top}th{background:#ffffff08;color:#fff;font-weight:600}
footer{max-width:760px;margin:0 auto;padding:24px 20px 48px;border-top:1px solid #ffffff14;color:#8a8a8a;font-size:13px}footer a{margin-right:16px}</style></head>
<body><header><a href="/">VIBEFLIX</a></header><main><h1>${title}</h1><p class="date">시행일: ${EFFECTIVE_DATE}</p>${body(contact)}</main>
<footer><a href="/">홈으로</a><a href="/privacy">개인정보처리방침</a><a href="/terms">이용약관</a></footer></body></html>`;
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
}
