# VIBEFLIX

한국어 바이브 코딩 서비스 쇼케이스. 전체 화면 추천 배너, 가로 작품 목록, 검색·카테고리·정렬·찜하기와 실제 서비스 바로가기를 제공합니다.

## 현재 서비스

기본 작품은 D1 `projects` 테이블(`source='catalog'`)에 있고 운영자 대시보드에서 관리합니다. `public/catalog.json`은 처음 데이터를 넣을 때(마이그레이션 `0006`)와 API 장애 시 대체 목록, ‘기본 디자인으로’ 되돌릴 때만 씁니다. Koiworld, Dayflow, 네모낚시, LearnHub, Deepchoi의 실제 공개 URL을 연결했고 GOD OF TOP, VOYAGE는 공개 준비 중으로 표시합니다. 카드에는 기존 프로젝트의 스토어 이미지·화면과 소스 설명을 사용합니다. VOYAGE 풍경은 콘셉트 이미지입니다.

## 실행

Node.js 22.13 이상. `npm run install:ci`로 의존성을 설치하고 `npm run dev`로 실행합니다. Windows npm shim 문제가 발생하면 `node scripts/run-framework.mjs dev`를 사용할 수 있습니다.

프런트엔드: `app/site.html`, `public/style.css`, `public/app.js`.
서버: Vinext API routes, Cloudflare D1 (`DB`). Sites starter의 호스팅 통합을 유지합니다.

## 로그인과 커뮤니티

- ChatGPT 로그인과 VIBEFLIX 전용 Firebase Google 로그인.
- Google ID 토큰의 서명·프로젝트·제공업체·만료·최근 인증·계정 상태를 서버에서 확인합니다. 로그인 세션은 서버 D1에 해시로 저장하고 브라우저에는 HttpOnly 쿠키를 사용합니다.
- 카테고리별 게시판(작품 소개·개발 일지·질문·피드백·자유 이야기), 검색, 최신순/추천순, 더 보기, 글 작성·수정·목록에서 내리기, 로컬 초안 자동 저장.
- 작품과 게시글의 댓글·대댓글, 댓글 수정·삭제, 댓글 추천과 답장 알림.
- 작품별 1~5점 별점과 한 줄 리뷰. 계정당 한 개 평가를 저장하고 재평가하면 수정합니다. 평균·평가 수를 보여줍니다.
- 작품·글·댓글의 추천은 계정당 한 번 집계하고 취소할 수 있습니다. 별점 높은 순과 이용자 추천순 정렬을 제공합니다.
- 로그인한 계정의 찜 목록 동기화. 비로그인 찜은 로컬 저장입니다.
- 프로필 닉네임·소개 수정, 내 작품·글·댓글 목록, 공개 작품 수정·내리기·다시 공개.
- 신고 접수·중복 방지·원문 검토와 운영자 숨김 처리. 운영자가 숨긴 작품은 작성자가 임의로 복구할 수 없습니다.
- 서비스·게시글 공유 링크와 댓글/목록 페이지 단위 불러오기.

Google 공개 설정은 `public/firebase-config.json`에 있습니다. Firebase 프로젝트는 `vibeflix-community-choi`이며 다른 기존 서비스의 Firebase와 분리했습니다. 공개 Firebase API 키는 인증 토큰이나 서비스 계정 비밀키가 아닙니다. Google와 ChatGPT 계정은 자동 병합하지 않습니다.

운영자 이메일은 배포 런타임의 비밀 환경 변수 `ADMIN_EMAILS`로 설정합니다. 첫 방문자에게 자동 운영자 권한을 부여하지 않습니다. 운영자는 로그인 후 내 프로필의 ‘신고 관리’에서 접수된 신고를 검토합니다.

## 공용 등록

- 방문과 서비스 이용 링크는 비로그인 상태로 접근할 수 있습니다.
- 작품 등록은 Google 또는 ChatGPT 로그인으로 인증합니다.
- 공개 작품 정보는 D1에 저장되어 모든 방문자에게 보입니다. 계정 ID는 반환하지 않습니다.
- 작성자는 자신의 커뮤니티 작품만 목록에서 내릴 수 있습니다. 데이터는 soft delete로 보존됩니다.
- 요청 출처, 필수 입력, 공개 http(s) URL, 중복 링크와 하루 10건 등록 제한을 서버에서 확인합니다.
- 로그인한 찜 목록은 D1, 비로그인 찜 목록은 현재 브라우저의 localStorage에 저장됩니다.
- 사용자 입력 링크의 보안·콘텐츠를 자동 심사하지는 않습니다.

## 데이터베이스와 검증

스키마는 `db/schema.ts`, 마이그레이션은 `drizzle/`입니다. 스키마 수정 후 `npm run db:generate`로 새 마이그레이션을 만듭니다. 로컬 D1은 빌드 후 Sites starter README의 방식으로 마이그레이션을 적용해야 합니다. 호스팅 D1에는 Sites 배포 시 적용됩니다.

`node scripts/check-api.mjs http://127.0.0.1:5174`는 로컬 미리보기에서만 실행하며 임시 레코드를 만들고 내립니다. 공개 조회, 인증, 출처 검사, 잘못된 URL, 공용 저장, 중복, 작성자 소유권과 soft delete를 검증합니다.

`node scripts/check-community.mjs http://127.0.0.1:5297`는 두 명의 로컬 테스트 사용자를 만들어 인증·권한·게시글·댓글·답글·알림·추천 중복 방지·별점·찜·신고·운영자 숨김·복원 제한·위조 로그인 거부·로그아웃을 검증하고 임시 데이터를 정리합니다. 프로덕션 URL에서는 실행되지 않습니다. 기본 미리보기 포트가 다른 프로젝트와 겹치면 `node scripts/run-framework.mjs dev --port 5297`로 시작하세요.

새 마이그레이션 `0001`, `0002`는 추가 테이블과 nullable 열만 생성합니다. 기존 작품 레코드는 유지합니다. 테스트 fixture와 OAuth 토큰, Firebase CLI 로그, 실행 상태는 배포 소스에 포함하지 않습니다.

## 배포

운영은 아래 Cloudflare Workers 배포로 합니다. ChatGPT Sites(`vibeflix-discover.loftytitan16.chatgpt.site`)는 이전 배포처이며 DB가 따로입니다. Sites 프로젝트 ID와 D1 바인딩은 `.openai/hosting.json`에 있고, Sites workflow로 소스를 동기화한 뒤 빌드 아카이브를 저장·배포합니다. 비밀값과 로컬 세션은 소스에 포함하지 않습니다.

배경 산 사진: Unsplash photo `1464822759023-fed622ff2c3b`. 나머지 서비스 이미지는 사용자의 기존 `app-release/store-assets`와 `deepchoi/public`에서 가져왔습니다.

## Cloudflare Workers 배포 (운영 사이트)

운영 주소는 **https://vibeflix.cryingonion77.workers.dev** 입니다. Worker 이름은 `vibeflix`, D1 데이터베이스는 `vibeflix-db`입니다. Cloudflare 계정에 로그인(`wrangler login`)한 상태에서:

```
npm run deploy:workers            # 빌드 → 새 마이그레이션 적용 → 배포
npm run deploy:workers -- --dry   # 실행할 명령만 확인
```

`scripts/deploy-workers.mjs`가 `dist/server/wrangler.json`의 Worker 이름·D1 연결을 실제 값으로 바꾸고 Workers 로그(observability)를 켭니다. 적용한 마이그레이션은 원격 D1의 `_vibeflix_migrations` 테이블에 기록해 다시 실행하지 않습니다. 스키마를 바꿨다면 먼저 `npm run db:generate`로 마이그레이션을 만듭니다.

- 운영자 권한: `npx wrangler secret put ADMIN_EMAILS --name vibeflix` (쉼표로 여러 개). 설정 후 그 이메일로 **다시 로그인**하면 운영자가 됩니다.
- ChatGPT 로그인은 Sites 전용이라 Workers에서는 버튼이 자동으로 숨겨집니다. Google 로그인은 Firebase 승인 도메인에 `vibeflix.cryingonion77.workers.dev`가 등록되어 있습니다.
- 로그: Cloudflare 대시보드 → Workers → vibeflix → Logs, 또는 `npx wrangler tail vibeflix`.
- 백업·복구: D1은 최근 30일 안의 시점으로 되돌릴 수 있습니다. `npx wrangler d1 time-travel info vibeflix-db`로 확인하고 `npx wrangler d1 time-travel restore vibeflix-db --timestamp=<ISO 시각>`으로 복구합니다. 따로 보관하려면 `npx wrangler d1 export vibeflix-db --remote --output backup.sql`.

## 운영자 대시보드

운영자 계정으로 로그인하면 헤더에 ‘운영’ 버튼이 보이고 `/admin`으로 들어갑니다. 모든 작업은 `/api/admin`을 거치며 운영자 세션이 필요합니다.

- 현황: 회원·작품·글·댓글 수, 오늘 늘어난 수, 처리 대기 신고, 최근 14일 방문자. 방문자는 IP를 저장하지 않고 하루 단위 해시로만 셉니다(90일 뒤 삭제).
- 작품: 수정(이름·크리에이터·카테고리·공개/공개 예정·링크·한 줄 소개·소개·태그), 썸네일 교체(아무 이미지나 고르면 16:9로 잘라 1280×720으로 맞춤), 기본 작품은 ‘기본 디자인으로’ 되돌리기, 숨기기/다시 공개, 영구 삭제(이름 입력 확인, 댓글·추천·별점·찜·신고 함께 삭제), ‘지금, 주목할 바이브’ 맨 앞 고정과 순서 변경(최대 10개).
- 배너: 홈 상단 슬라이드 추가·수정·삭제·켜기/끄기·순서 변경(최대 10개). 연결 작품, 제목, 설명(세 줄), 버튼 문구·아이콘·링크, 디자인(코이월드·네모낚시·Dayflow 테마 또는 올린 이미지를 배경 전체에 쓰는 ‘직접 꾸미기’)을 고릅니다.
- 회원: 정지(즉시 로그아웃)/해제, 운영자 지정/해제, 영구 삭제(탈퇴 요청 처리 — 작품·글·댓글·추천·별점·찜·알림까지 삭제). 내 계정과 운영자는 정지·삭제할 수 없습니다.
- 게시글·댓글: 검색, 숨김만 보기, 숨기기/다시 공개, 영구 삭제(답글 포함).
- 신고: 콘텐츠 숨기기 또는 기각.
- 사이트 설정: 상단 공지 띠(문구·링크), 개인정보처리방침·이용약관에 공개할 문의 이메일, 예시 콘텐츠 모두 지우기.
- 예시 콘텐츠(마이그레이션 `0008`): 빈 카테고리를 채우는 임시 작품 12개(그림·만화·영상·소설, 표지는 `public/assets/samples/`), 게시판마다 글 2개, 카테고리 배너 3개. `source='sample'` / 작성자 `system:sample`이며 사이트에 ‘예시’로 표시되고 링크가 없습니다. 홈 배너와 ‘지금, 주목할 바이브’에는 나오지 않습니다.
- 처리 기록: 모든 운영 작업을 사유와 함께 최근 100건까지 보여줍니다.

`/privacy`(개인정보처리방침)와 `/terms`(이용약관)는 푸터에서 연결됩니다. 실제 수집 항목에 맞춰 작성했지만, 공개 전에 내용을 한 번 검토하세요.
