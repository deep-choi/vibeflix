# VIBEFLIX 디자인 시스템

사이트(홈), 작품·회차·크리에이터 페이지, 운영자 대시보드가 함께 쓰는 토큰과 컴포넌트예요.

- 스타일: `public/ds.css` — 유일한 기준. 모든 페이지가 가장 먼저 불러와요.
- 동작: `public/ds.js` — 토스트, 확인 대화상자, 모달 닫기 규칙, 휴대폰 시트 손잡이.
- 살아 있는 견본: `/design-system` (검색엔진 제외). 모든 컴포넌트를 데스크톱·휴대폰 폭에서 바로 확인할 수 있어요.

## 원칙

1. **한 곳에서 정한다.** 버튼·입력칸·모달의 생김새는 `ds.css`에만 있어요. 페이지 CSS는 배치(레이아웃)만 맡아요.
2. **어디서든 같은 모양.** 같은 컴포넌트가 화면마다 크기·글자·모서리가 달라지지 않아요. 크기는 `small / 기본 / large` 세 가지뿐이에요.
3. **휴대폰 먼저 읽히게.** 가장 작은 글자는 12px(대문자 라벨만 11px), 입력칸은 휴대폰에서 16px(iOS 확대 방지), 터치 화면의 누르는 영역은 40px 이상.
4. **실수로 잃지 않게.** 글을 쓰는 모달은 닫기 전에 물어보고, 위험한 확인은 안전한 쪽(취소)에 먼저 초점이 가요.

## 구조: 캐스케이드 레이어

```css
@layer page, ds;   /* 나중에 선언된 ds가 항상 이김 */
```

- `ds.css`의 규칙은 `@layer ds`, 페이지 CSS(`style.css`, `community.css`, `netflix.css`, `block-editor.css`, `work.css`, `admin.css`, 서버 페이지의 인라인 스타일)는 `@layer page` 안에 있어요.
- 레이어 순서가 선택자 우선순위보다 앞서기 때문에, 페이지 CSS에 `.detail-actions .primary-button { font-size: 11px }` 같은 예전 규칙이 남아 있어도 `ds.css`가 정한 속성은 시스템 값이 쓰여요. 페이지 CSS는 `ds.css`가 정하지 않는 속성(배치, flex, 여백 등)만 바꿔요.
- 특정 화면에서 컴포넌트를 달리 써야 하면 페이지 CSS가 아니라 `ds.css` §11(화면별 배치)에 이유와 함께 적어요.

## 토큰

| 분류 | 토큰 | 값 / 용도 |
|---|---|---|
| 바탕 | `--ds-bg` `--ds-surface` `--ds-surface-raised` `--ds-surface-sunken` | 페이지 · 패널·카드 · 모달 · 입력칸 |
| 채움 | `--ds-fill` `--ds-fill-hover` `--ds-fill-strong` | 기본 버튼·칩 바탕, 마우스 올림, 선택된 탭 |
| 선 | `--ds-border` `--ds-border-strong` `--ds-border-hover` | 카드 · 입력칸 · 마우스 올림 |
| 글자 | `--ds-text` `--ds-text-2` `--ds-text-3` | 본문 · 보조 · 메타(모두 대비 AA 이상) |
| 강조 | `--ds-accent` `--ds-accent-hover` `--ds-on-accent` `--ds-accent-soft` `--ds-accent-line` | 라임 #c3f568과 그 위 글자, 옅은 배경, 테두리 |
| 상태 | `--ds-success` `--ds-warning(-soft/-line)` `--ds-danger(-soft/-line)` `--ds-info(-soft/-line)` | 글자색 · 옅은 배경 · 테두리 세 단계 |
| 글자 크기 | `--ds-text-xs 12` `sm 13` `md 15` `lg 17` `xl 20` `2xl 24` `3xl 30` | 12px 미만은 쓰지 않아요 |
| 간격 | `--ds-space-1…10` | 4px 단위(4·8·12·16·20·24·32·40) |
| 모서리 | `--ds-radius-sm 8` `md 12` `lg 20` `control 10` `pill` | 배지·칩·버튼은 pill, 입력칸 10, 카드 12, 모달 20 |
| 높이 | `--ds-control-sm 36` `md 44` `lg 52` | 버튼·입력칸 |
| 그림자 | `--ds-shadow-1…3` | 메뉴 · 토스트 · 모달 |
| 움직임 | `--ds-ease` `--ds-dur-1 .12s` `--ds-dur-2 .24s` | `prefers-reduced-motion`이면 꺼져요 |

예전 변수(`--lime`, `--panel`, `--line`, `--text`, `--muted`, `--danger` …)도 이 토큰을 가리키도록 `ds.css`가 다시 정의해요.

## 컴포넌트

### 버튼 `.btn`

```html
<button class="btn primary">공개 등록하기</button>
<button class="btn">임시 저장</button>
<button class="btn ghost">건너뛰기</button>
<button class="btn danger">숨기기</button>              <!-- 줄 안의 위험 동작: 옅은 빨강 -->
<button class="btn primary danger">영구 삭제</button>   <!-- 대화상자의 주 동작: 꽉 찬 빨강 -->
<button class="btn link">더 보기</button>
<button class="btn icon" aria-label="검색">…</button>
<button class="btn" aria-pressed="true">✓ 찜했어요</button>  <!-- 켜고 끄는 버튼 -->
```

- 크기: `small`(36, 줄 안·표·댓글) · 기본(44) · `large`(52, 히어로와 로그인처럼 한 화면의 주 버튼). 터치 화면에서 `small`은 40px.
- `block`은 폭 100%. 모달 하단 버튼은 글자 길이만큼(휴대폰에서는 나란히 같은 폭).
- 비활성은 `disabled`. 한 영역의 주 버튼(primary)은 하나만.

### 입력칸

모달, 쓰는 페이지(`.form-page`), `.field`, `.ad-field`, 댓글·별점 폼 안의 `input` · `select` · `textarea`에 적용돼요.

```html
<label>작품 이름 <small>필수</small><input placeholder="…"></label>
<input aria-invalid="true"><span class="ds-error">공개 주소만 등록할 수 있어요.</span>
<span class="ds-hint">0 / 1,000자</span>
```

포커스는 라임 테두리와 옅은 링, 오류는 `aria-invalid="true"` 또는 브라우저 검사(`:user-invalid`) 결과로 빨간 테두리. 체크박스·라디오는 18px, 라임.

### 칩 `.chip-btn`, 배지 `.badge`

- 칩은 누르는 요소예요. 하나만 고르는 필터는 `aria-current="true"`(꽉 찬 라임), 여러 개 고르는 토글은 `aria-pressed="true"`(옅은 라임).
- 배지는 보기만 하는 라벨이에요. `accent`(해결됨·운영자 확인) · `success`(공개) · `warning`(성인 소재) · `danger`(버그 제보·숨김) · `info`(피드백).

### 탭

- `.segmented` — 2~4개 중 하나를 고르는 둥근 스위치(로그인/회원가입, 댓글 분류, 처리 대기/전체). 선택은 `aria-selected="true"`.
- `.tabs` — 화면 영역을 바꾸는 밑줄 탭(내 프로필).

### 알림 `.alert`, 토스트

- 페이지 안 안내: `.alert`, `.alert.accent`, `.alert.warning`, `.alert.danger`.
- 잠깐 뜨는 결과: `DS.toast('저장했어요.')`, 오류는 `DS.toast(msg, { tone: 'danger' })`. 팝오버로 떠서 열린 모달 위에도 보이고, 모달이 열려 있으면 그 안에 들어가 화면낭독기에도 읽혀요. 브라우저 `alert()`는 쓰지 않아요.

### 모달 `dialog.modal`

```html
<dialog class="modal modal-sm" aria-labelledby="t">
  <button class="modal-close" aria-label="닫기" data-close></button>
  <span class="ds-kicker">KICKER</span>
  <h2 id="t">제목</h2>
  <p>설명</p>
  …내용…
  <div class="modal-actions"><button class="btn" data-close>취소</button><button class="btn primary">확인</button></div>
</dialog>
```

| 크기 | 폭 | 쓰는 곳 |
|---|---|---|
| `modal-sm` | 440 | 확인, 신고, 이의 제기, 로그인, 외부 링크 이동, 회원 도구, 운영자 확인 |
| 기본 | 560 | 안내 |
| 알림 | 600 | 알림 목록 |
| `modal-lg` | 720 | 운영자 편집 |

- **데스크톱**: 가운데 카드, 반투명 흐린 배경, 위로 살짝 떠오르는 등장.
- **휴대폰(≤640px)**: 아래에서 올라오는 시트. 폭 100%, 위 모서리만 둥글게, 안전 영역 여백, 맨 위 손잡이를 끌어내리면 닫혀요.
- **닫기 버튼**은 스크롤해도 오른쪽 위 모서리(12px)에 고정돼요. 제목은 닫기 버튼이 있을 때만 그만큼 비워둬요.
- **하단 버튼**: `.modal-actions`는 오른쪽 정렬(휴대폰은 나란히 같은 폭). 긴 폼은 `.modal-actions.sticky`(또는 `.form-submit-row`)로 하단에 고정해서 주 버튼이 늘 한 번에 닿게 해요.
- **닫기 규칙**(`ds.js`): `[data-close]`, 배경 클릭, Esc, 휴대폰 손잡이. 배경 클릭으로 닫히면 안 되는 모달은 `data-dismiss="manual"`.
- **작성 보호**: 글을 쓰는 모달에는 `data-guard-unsaved`를 달아요. 입력이 있으면 어떤 방법으로 닫든 “작성 중인 내용을 닫을까요?”를 먼저 물어봐요. 코드에서 닫을 때는 `DS.requestClose(dialog)`.
- **확인**: `await DS.confirm({ title, message, confirmLabel, tone: 'danger' })` → `true/false`. 위험한 확인은 취소에 먼저 초점이 가요. 브라우저 `confirm()`은 쓰지 않아요.
- 한국어 제목·설명은 낱말 단위로 줄이 바뀌어요(`word-break: keep-all`).

### 썸네일과 커버 없음 `.cover-ph`

- **썸네일은 그림만.** 제목은 카드 아래(데스크톱은 포스터 아래 캡션, 마우스를 올리면 정보 패널)에 글자로 나와요. 그림 안에 제목을 글꼴로 그려 넣지 않아요 — 아래 제목과 겹치고, 좁은 폭에서 깨져요("Blockabl/e").
- **커버가 없는 작품**은 `<div class="cover-ph" data-type="game" data-tone="0–5" aria-hidden="true">` — 작품 id로 고른 어두운 그라디언트와 분류 아이콘. 홈 카드(`public/app.js`), 작가 페이지·작품 페이지(`coverPlaceholder()` in `lib/page-shell.ts`)가 같은 규칙을 써요.
- 그림 위에 얹는 것은 상태 배지뿐이에요: `성인 소재`, `예시`(운영자 예시 작품), `콘셉트 이미지`.

## 박스를 겹치지 않아요

구조는 여백, 제목 크기, 얇은 구분선으로 만들어요. 섹션에 배경이나 테두리를 주지 않고, 숫자도 박스 없이 나란히 놓아요. 박스는 입력칸과 팝업처럼 필요한 곳에 한 겹만 써요.

## 모달과 페이지

모달은 잠깐 끝나는 일(로그인, 신고, 확인, 알림 목록)에만 써요. 작품 카드는 모달 없이 작품 페이지로 바로 가요. 오래 머무는 일은 페이지로 만들어요.

- **긴 글을 쓰거나 항목이 많으면 페이지.** 고유 주소가 있어서 새로고침·뒤로가기·공유가 자연스러워요.
- **쓰는 페이지**는 `formPageResponse()`(`lib/page-shell.ts`)로 만들어요: 왼쪽 항목 메뉴(휴대폰은 위쪽 가로 메뉴), `.fp-section` 카드, 하단에 고정되는 `.fp-bar`. 스타일은 `public/form-page.css`.
- **작성 보호**: `Social.guard(form)`(`public/social.js`)가 저장하지 않은 입력이 있으면 페이지를 떠나기 전에 브라우저가 물어보게 해요.
- **내 스튜디오**(`/studio`, `lib/studio.ts`, `public/studio.css`)는 로그인한 고객 모두의 작품 관리 공간이에요. 작품이 없어도 열리고, 그때는 올리기부터 안내해요.
- **세션이 끝나도 입력을 지켜요.** 저장이 401이면 로그인 화면으로 보내지 않고 오류를 보여줘요. 다른 탭에서 로그인한 뒤 같은 화면에서 저장하면 돼요.

## 접근성

- 모든 모달에 `aria-labelledby`(또는 `aria-label`). 아이콘만 있는 버튼에는 `aria-label`.
- 키보드 초점은 라임 2px 테두리(`:focus-visible`). 모달은 `showModal()`로 열어 초점이 안에 갇혀요.
- 색만으로 상태를 전하지 않아요(배지에 글자, 오류에 메시지).
- 움직임 줄이기 설정이면 등장 애니메이션이 꺼져요.

## 예전 클래스 대응표

새로 만드는 화면은 왼쪽 이름을 써요. 오른쪽 이름은 기존 화면 호환을 위해 같은 컴포넌트로 연결돼 있어요.

| 컴포넌트 | 기존 클래스 |
|---|---|
| `.btn.primary` | `.primary-button`, `.ad-btn.primary`, `.upload-button`, `.email-submit` |
| `.btn` | `.secondary-button`, `.ad-btn`, `.chatgpt-sign-in` |
| `.btn.link` | `.text-button`, `.link` |
| `.btn.icon` | `.icon-button`, `.ad-btn.icon` |
| `.btn.small` | `.ad-btn`, 댓글·별점·운영 줄 안의 버튼들 |
| `.btn.large` | 히어로 버튼, 로그인 버튼, 크리에이터 배너 |
| `.chip-btn` | `.filter`, `.community-tabs > button`, `.genre-chip`, `.ad-chip`, `.nf-cat-chips button` |
| `.badge` | `.chip`(작품 페이지), `.ad-badge`, `.question-badge`, `.verified-chip`, `.accepted-badge`, `.post-category`, `.type-label`, `.mature-label` |
| `.segmented` | `.ad-seg`, `.comment-tabs`, `.email-auth-tabs` |
| `.tabs` | `.profile-tabs` |
| `.alert` | `.catalog-status`, `.inline-error`, `.mature-gate` |
| `.ds-toast` | `.toast`, `.work-toast`, `.ad-toast`(모두 `DS.toast`로 대체) |
| `dialog.modal` 크기 | `.auth-modal` → sm, `.profile-modal` · `.ad-edit` → lg |
| `.modal-actions` | `.ad-dialog-actions` |

## 새 화면을 만들 때

1. 페이지에서 `/ds.css`를 가장 먼저, `/ds.js`를 다른 스크립트보다 먼저 불러와요.
2. 페이지 CSS는 `@layer page { … }` 안에 쓰고, 배치만 다뤄요.
3. 버튼·입력칸·모달은 위 컴포넌트를 그대로 써요. 새 변형이 필요하면 `ds.css`에 추가하고 `/design-system`과 이 문서에 함께 적어요.
4. 데스크톱(1440)과 휴대폰 폭에서 견본 페이지와 실제 화면을 확인해요. 휴대폰은 **360px**(갤럭시 기본 폭)이 가장 좁은 기준이고, 390·412px도 함께 봐요.

## 휴대폰 홈에서 지키는 것 (`ds.css` 11번 절)

- **가로로 넘기는 줄**(상단 분류 탭, 분류 칩)은 화면 끝까지 이어지고 오른쪽 끝이 흐려져요. 글자가 반쯤 잘려 보이지 않고 "더 넘길 수 있음"으로 읽혀요.
- **추천 배너**: 세로로 긴 포스터(약 4:5). 그림이 위쪽을 채우고, 제목·소개·버튼은 아래쪽 어두운 그라디언트 위에 전체 폭으로 놓여요. 배너는 글이 길거나 글자 크기를 키운 휴대폰에서 늘어나고, 잘리지 않아요.
- **배너 버튼**: 주 버튼이 한 줄을 차지하고, 자세히 보기(ⓘ)·찜(＋)은 같은 모양의 44px 원이에요. 화면 읽기용 이름은 그대로예요. 운영자가 긴 버튼 문구를 써도 줄이 넘치지 않아요.
- **카드 제목**은 포스터 왼쪽 끝에 맞추고, 터치 화면에서는 줄 사이 간격을 줄여요.
