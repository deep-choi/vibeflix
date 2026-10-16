# VIBEFLIX

한국어 바이브 코딩 서비스 쇼케이스. 전체 화면 추천 배너, 가로 작품 목록, 검색·카테고리·정렬·찜하기와 실제 서비스 바로가기를 제공합니다.

## 현재 서비스

`public/catalog.json`에서 기본 소개를 관리합니다. Koiworld, Dayflow, 네모낚시, LearnHub, Deepchoi의 실제 공개 URL을 연결했고 GOD OF TOP, VOYAGE는 공개 준비 중으로 표시합니다. 카드에는 기존 프로젝트의 스토어 이미지·화면과 소스 설명을 사용합니다. VOYAGE 풍경은 콘셉트 이미지입니다.

## 실행

Node.js 22.13 이상. `npm run install:ci`로 의존성을 설치하고 `npm run dev`로 실행합니다. Windows npm shim 문제가 발생하면 `node scripts/run-framework.mjs dev`를 사용할 수 있습니다.

프런트엔드: `app/site.html`, `public/style.css`, `public/app.js`.
서버: Vinext API routes, Cloudflare D1 (`DB`). Sites starter의 호스팅 통합을 유지합니다.

## 공용 등록

- 방문과 서비스 이용 링크는 비로그인 상태로 접근할 수 있습니다.
- 작품 등록은 Sites의 ChatGPT 로그인으로 인증합니다.
- 공개 작품 정보는 D1에 저장되어 모든 방문자에게 보입니다. 계정 ID는 반환하지 않습니다.
- 작성자는 자신의 커뮤니티 작품만 목록에서 내릴 수 있습니다. 데이터는 soft delete로 보존됩니다.
- 요청 출처, 필수 입력, 공개 http(s) URL, 중복 링크와 하루 10건 등록 제한을 서버에서 확인합니다.
- 찜 목록은 현재 브라우저의 localStorage에 저장됩니다.
- 사용자 입력 링크의 보안·콘텐츠를 자동 심사하지는 않습니다.

## 데이터베이스와 검증

스키마는 `db/schema.ts`, 마이그레이션은 `drizzle/`입니다. 스키마 수정 후 `npm run db:generate`로 새 마이그레이션을 만듭니다. 로컬 D1은 빌드 후 Sites starter README의 방식으로 마이그레이션을 적용해야 합니다. 호스팅 D1에는 Sites 배포 시 적용됩니다.

`node scripts/check-api.mjs http://127.0.0.1:5174`는 로컬 미리보기에서만 실행하며 임시 레코드를 만들고 내립니다. 공개 조회, 인증, 출처 검사, 잘못된 URL, 공용 저장, 중복, 작성자 소유권과 soft delete를 검증합니다.

## 배포

프로젝트 ID와 D1 바인딩은 `.openai/hosting.json`에 있습니다. Sites workflow로 소스를 동기화한 뒤 빌드 아카이브를 저장·배포합니다. 비밀값과 로컬 세션은 소스에 포함하지 않습니다.

배경 산 사진: Unsplash photo `1464822759023-fed622ff2c3b`. 나머지 서비스 이미지는 사용자의 기존 `app-release/store-assets`와 `deepchoi/public`에서 가져왔습니다.
