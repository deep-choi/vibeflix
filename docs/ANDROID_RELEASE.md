# VIBEFLIX Android release

- Name: VIBEFLIX
- Package: `com.deepchoi.vibeflix`
- Version: `1.0.0` / code `1`
- Language: Korean (`ko-KR`), free app
- Target: API 36; Android 7.0 / API 24 or later
- Launch origin: `https://vibeflix.cryingonion77.workers.dev/`
- Implementation: Google's Android Browser Helper / Trusted Web Activity. External creators' services open with browser origin controls.
- Privacy policy: `/privacy`
- Account/data deletion: `/account-deletion`; authenticated requests appear as `탈퇴 요청` in the operator's member list.

## Store copy

Short description:

크리에이터의 웹사이트·앱·게임과 창작물을 발견하고 함께 이야기하세요.

Full description:

VIBEFLIX에서 크리에이터들이 만든 다양한 작품을 둘러보세요.

• 웹사이트, 앱, 게임, 그림, 만화, 영상, 소설을 카테고리별로 발견할 수 있습니다.
• 작품 소개와 제작 이야기를 읽고, 공개된 서비스로 이동할 수 있습니다.
• 관심 있는 작품을 찜하고 크리에이터를 팔로우할 수 있습니다.
• 자신의 작품과 개발 이야기를 소개하고 댓글과 별점으로 경험을 나눌 수 있습니다.
• 불편한 콘텐츠와 이용자를 신고하고 작성자를 차단할 수 있습니다.

작품 둘러보기는 로그인 없이 이용할 수 있습니다. 작품 등록, 커뮤니티 참여, 계정 동기화에는 로그인이 필요합니다. 인터넷 연결이 필요하며, 외부 작품은 각 제작자가 운영합니다.

Release notes:

VIBEFLIX의 첫 Android 버전입니다. 작품 발견, 찜과 팔로우, 커뮤니티, 이용자 신고·차단과 계정 삭제 요청을 제공합니다.

## Operator: process account deletion requests

1. Open the operator dashboard → 회원 and find the `탈퇴 요청` badge.
2. Confirm the requester's identity. For Google users, remove their VIBEFLIX Firebase Authentication user in Firebase Console → `vibeflix-community-choi` → Authentication → Users. This removes the app's authentication identity, not their Google account.
3. Delete the member through the existing operator action after checking the displayed member name. This permanently removes their works/images, posts/comments/reviews, reactions, bookmarks, follows, notifications, sessions, consent, block preferences and deletion request.
4. Do not mark the request finished while either the app's member data or Firebase authentication identity remains. Do not test deletion using a real member.

## Release checks

- Signed AAB/APK, package/version/target SDK and certificate must match the release record.
- Add both the upload certificate and Google Play app-signing certificate to `public/.well-known/assetlinks.json` after Play assigns the app-signing certificate. Deploy before testing a Play-installed build.
- Run TypeScript, framework build and local `scripts/check-community.mjs` regressions against disposable members. `VIBEFLIX_QA_PERSIST` selects an isolated local database.
- Verify public privacy/deletion pages, manifest, asset links and login/content APIs on the deployed origin separately.
- Store submission, public availability and physical-device validation are separate milestones.
