import html from '../site.html?raw';
import { SECURITY_HEADERS, versionAssets } from '../../lib/security';

export const dynamic = 'force-dynamic';
const page = versionAssets(html
  .replace('<body>', '<body class="account-page">')
  .replace('<main>', '<main id="home-main">')
  .replace('<dialog id="profile-dialog" class="modal profile-modal" aria-label="내 프로필"><button class="modal-close" aria-label="닫기" data-close>✕</button><div id="profile-content"></div></dialog>', '<main class="account-shell"><header class="account-top"><a href="/">← VIBEFLIX 홈</a><h1>내 계정</h1><p>프로필과 활동을 한곳에서 관리하세요.</p></header><div id="profile-content"><p class="loading-copy">계정 정보를 불러오는 중…</p></div></main><dialog id="profile-dialog"></dialog>')
  .replace('</head>', '<link rel="stylesheet" href="/account.css"></head>'));
export function GET() {
  return new Response(page, { headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
