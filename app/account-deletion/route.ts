import { legalPage } from '../../lib/legal';
export const dynamic = 'force-dynamic';
export function GET() {
  return legalPage('계정 및 데이터 삭제 요청', contact => `
<p>VIBEFLIX 계정과 관련 데이터를 삭제하려면 아래 방법으로 요청해주세요.</p>
<h2>앱 또는 웹에서 요청</h2>
<ol><li>VIBEFLIX에 로그인합니다.</li><li>내 프로필에서 ‘계정 삭제 요청’을 누릅니다.</li><li>‘삭제 요청’을 입력하고 요청을 제출합니다.</li></ol>
<p><a href="/?account-deletion=1">VIBEFLIX에서 삭제 요청하기 →</a></p>
<h2>로그인할 수 없는 경우</h2>
<p>${contact}로 제목 ‘VIBEFLIX 계정 삭제 요청’, 공개 닉네임과 로그인 방법을 보내주세요. 비밀번호나 인증 코드는 보내지 마세요. 본인 확인 후 처리합니다.</p>
<h2>삭제되는 데이터</h2>
<p>회원 프로필, 등록한 작품과 이미지, 게시글·댓글·리뷰, 추천·별점·찜·팔로우, 알림과 로그인 세션을 삭제합니다. VIBEFLIX의 Google 로그인 연결 정보도 함께 삭제하며, Google 계정 자체는 삭제하지 않습니다.</p>
<p>접수된 요청은 운영자가 본인 여부를 확인한 뒤 처리합니다. 삭제 후에는 복구할 수 없습니다.</p>`);
}
