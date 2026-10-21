-- Temporary sample content so empty categories, board categories and category heroes are not blank.
-- Everything here is marked (source='sample' / owner system:sample) and can be removed at once from /admin → 사이트 설정.
INSERT OR IGNORE INTO `profiles` (`id`, `public_id`, `name`, `bio`, `avatar`, `role`, `suspended`, `created`, `updated`) VALUES ('system:sample', 'vibeflix-sample', 'VIBEFLIX 예시', '화면 구성을 보여주기 위한 예시 계정이에요.', '', 'member', 0, 1792540800000, 1792540800000);
--> statement-breakpoint
INSERT OR IGNORE INTO `projects` (`id`, `owner_id`, `title`, `creator`, `type`, `description`, `url`, `image`, `created`, `source`, `subtitle`, `art`, `badge`, `status`, `tags`, `genres`, `featured`, `sort`) VALUES
('sample-art-1', 'system:sample', '새벽 정류장', 'VIBEFLIX 예시', 'art', '새벽 다섯 시, 아직 불 꺼진 정류장에 모인 사람들을 따뜻한 색감으로 그린 일러스트 시리즈예요. 인물마다 짧은 사연을 붙였어요.', NULL, '/assets/samples/art-1.svg', 1792540800000, 'sample', '첫차를 기다리는 사람들의 작은 이야기', 'custom', 'SAMPLE', 'sample', '["예시"]', '["일러스트","캐릭터"]', 0, 0),
('sample-art-2', 'system:sample', '고양이 편의점', 'VIBEFLIX 예시', 'art', '손님보다 고양이가 더 많은 24시 편의점에서 벌어지는 일상 웹툰. 매주 한 편씩 짧게 이어지는 에피소드형이에요.', NULL, '/assets/samples/art-2.svg', 1792537200000, 'sample', '야간 근무는 고양이 점장님과 함께', 'custom', 'SAMPLE', 'sample', '["예시"]', '["웹툰"]', 0, 1),
('sample-art-3', 'system:sample', '픽셀 항구', 'VIBEFLIX 예시', 'art', '16색 팔레트만으로 그린 항구 마을 픽셀 아트. 낮과 밤, 비 오는 날 버전을 함께 담았어요.', NULL, '/assets/samples/art-3.svg', 1792533600000, 'sample', '16색으로 그린 바닷가 마을', 'custom', 'SAMPLE', 'sample', '["예시"]', '["픽셀 아트"]', 0, 2),
('sample-art-4', 'system:sample', '로봇 정원사', 'VIBEFLIX 예시', 'art', '폐허가 된 온실을 다시 가꾸는 로봇을 주인공으로 한 3D 컨셉 아트 모음. 캐릭터 시트와 배경 스케치를 포함해요.', NULL, '/assets/samples/art-4.svg', 1792530000000, 'sample', '버려진 온실을 돌보는 작은 로봇', 'custom', 'SAMPLE', 'sample', '["예시"]', '["3D 아트","컨셉 아트"]', 0, 3),
('sample-video-1', 'system:sample', '30초의 여름', 'VIBEFLIX 예시', 'video', '휴대폰 하나로 찍은 30초 단편 영화. 장마가 끝난 첫날의 공기를 장면 여섯 개로 담았어요.', NULL, '/assets/samples/video-1.svg', 1792526400000, 'sample', '여름 하루를 30초에 담은 단편', 'custom', 'SAMPLE', 'sample', '["예시"]', '["단편 영화"]', 0, 4),
('sample-video-2', 'system:sample', '종이 비행기', 'VIBEFLIX 예시', 'video', '종이 비행기 하나가 도시를 가로지르는 2분짜리 애니메이션. 손그림 질감을 살린 프레임 애니메이션이에요.', NULL, '/assets/samples/video-2.svg', 1792522800000, 'sample', '교실 창문 밖으로 날아간 비행기의 여행', 'custom', 'SAMPLE', 'sample', '["예시"]', '["애니메이션"]', 0, 5),
('sample-video-3', 'system:sample', 'Neon Drive', 'VIBEFLIX 예시', 'video', '신스웨이브 음악에 맞춰 네온 도로를 달리는 모션 그래픽 뮤직비디오. 비트에 맞춰 색이 바뀌어요.', NULL, '/assets/samples/video-3.svg', 1792519200000, 'sample', '밤 도로를 달리는 신스웨이브 뮤직비디오', 'custom', 'SAMPLE', 'sample', '["예시"]', '["뮤직비디오","모션 그래픽"]', 0, 6),
('sample-video-4', 'system:sample', 'AI로 그린 바다', 'VIBEFLIX 예시', 'video', 'AI 영상 도구로 만든 1분짜리 바다 풍경 영상. 각 장면에 쓴 프롬프트를 함께 공개했어요.', NULL, '/assets/samples/video-4.svg', 1792515600000, 'sample', '프롬프트 열두 줄로 만든 바다 영상', 'custom', 'SAMPLE', 'sample', '["예시"]', '["AI 영상"]', 0, 7),
('sample-novel-1', 'system:sample', '별을 줍는 사서', 'VIBEFLIX 예시', 'novel', '밤마다 떨어지는 별을 주워 책으로 엮는 사서의 판타지 연재 소설. 한 화에 별 하나씩 이야기가 열려요.', NULL, '/assets/samples/novel-1.svg', 1792512000000, 'sample', '떨어진 별을 책으로 엮는 도서관 이야기', 'custom', 'SAMPLE', 'sample', '["예시"]', '["판타지"]', 0, 8),
('sample-novel-2', 'system:sample', '편지 대신 커밋', 'VIBEFLIX 예시', 'novel', '같은 저장소에서 일하는 두 개발자가 커밋 메시지로 마음을 전하는 짧은 로맨스 소설이에요.', NULL, '/assets/samples/novel-2.svg', 1792508400000, 'sample', '커밋 메시지로 주고받는 고백', 'custom', 'SAMPLE', 'sample', '["예시"]', '["로맨스","일상·드라마"]', 0, 9),
('sample-novel-3', 'system:sample', '궤도 밖의 정원', 'VIBEFLIX 예시', 'novel', '궤도를 벗어난 정거장에서 혼자 정원을 지키는 사람의 일지 형식 SF 단편이에요.', NULL, '/assets/samples/novel-3.svg', 1792504800000, 'sample', '우주 정거장 마지막 정원사의 기록', 'custom', 'SAMPLE', 'sample', '["예시"]', '["SF"]', 0, 10),
('sample-novel-4', 'system:sample', '밤 11시의 탐정', 'VIBEFLIX 예시', 'novel', '밤 11시부터 새벽 3시까지만 의뢰를 받는 탐정의 미스터리 연작. 매 화 하나의 사건이 끝나요.', NULL, '/assets/samples/novel-4.svg', 1792501200000, 'sample', '퇴근 후에만 문을 여는 탐정 사무소', 'custom', 'SAMPLE', 'sample', '["예시"]', '["미스터리·스릴러"]', 0, 11);
--> statement-breakpoint
INSERT OR IGNORE INTO `posts` (`id`, `owner_id`, `title`, `body`, `category`, `project_id`, `created`, `updated`) VALUES
('sample-post-1', 'system:sample', '[예시] 주말에 만든 날씨 일기 앱을 소개해요', '하루 날씨와 기분을 한 줄로 남기는 작은 앱을 만들었어요. 바이브 코딩으로 이틀 만에 첫 버전을 완성했고, 지금은 친구들과 같이 쓰고 있어요.

이 글은 커뮤니티 화면을 보여주기 위해 운영자가 넣은 예시예요.', 'showcase', NULL, 1792540800000, 1792540800000),
('sample-post-2', 'system:sample', '[예시] 픽셀 아트 툴을 직접 만들어봤어요', '16색 팔레트만 쓰는 단순한 픽셀 에디터예요. 그린 그림을 바로 GIF로 내보낼 수 있게 만들었어요.

이 글은 커뮤니티 화면을 보여주기 위해 운영자가 넣은 예시예요.', 'showcase', NULL, 1792535400000, 1792535400000),
('sample-post-3', 'system:sample', '[예시] 개발 일지 #1 — 아이디어를 첫 화면으로', '첫날은 화면 세 개만 그려보는 걸 목표로 했어요. 기능보다 흐름을 먼저 잡으니 다음 단계가 훨씬 쉬워졌어요.

이 글은 커뮤니티 화면을 보여주기 위해 운영자가 넣은 예시예요.', 'buildlog', NULL, 1792530000000, 1792530000000),
('sample-post-4', 'system:sample', '[예시] 3일 만에 로그인 붙인 이야기', '처음엔 직접 만들려다 막혀서 인증 서비스를 붙였어요. 막혔던 부분과 해결 방법을 정리해둘게요.

이 글은 커뮤니티 화면을 보여주기 위해 운영자가 넣은 예시예요.', 'buildlog', NULL, 1792524600000, 1792524600000),
('sample-post-5', 'system:sample', '[예시] 웹 게임 모바일 최적화는 어떻게 하나요?', 'PC에서는 잘 도는데 휴대폰에서 프레임이 많이 떨어져요. 먼저 확인해볼 만한 게 있을까요?

이 글은 커뮤니티 화면을 보여주기 위해 운영자가 넣은 예시예요.', 'question', NULL, 1792519200000, 1792519200000),
('sample-post-6', 'system:sample', '[예시] 이미지 용량 줄이는 좋은 방법 있을까요?', '작품 소개 이미지를 올리면 용량 제한에 자주 걸려요. 화질을 지키면서 줄이는 방법이 궁금해요.

이 글은 커뮤니티 화면을 보여주기 위해 운영자가 넣은 예시예요.', 'question', NULL, 1792513800000, 1792513800000),
('sample-post-7', 'system:sample', '[예시] 랜딩 페이지 첫인상 피드백 부탁드려요', '처음 들어왔을 때 무슨 서비스인지 바로 보이는지 궁금해요. 솔직한 의견 환영해요.

이 글은 커뮤니티 화면을 보여주기 위해 운영자가 넣은 예시예요.', 'feedback', NULL, 1792508400000, 1792508400000),
('sample-post-8', 'system:sample', '[예시] 튜토리얼이 너무 긴가요?', '게임 시작 전에 튜토리얼이 다섯 단계인데, 줄이는 게 나을지 고민이에요.

이 글은 커뮤니티 화면을 보여주기 위해 운영자가 넣은 예시예요.', 'feedback', NULL, 1792503000000, 1792503000000),
('sample-post-9', 'system:sample', '[예시] 요즘 가장 재밌게 쓴 AI 도구', '다들 요즘 어떤 도구로 작업하세요? 저는 화면 설계할 때 쓰는 도구가 제일 도움이 됐어요.

이 글은 커뮤니티 화면을 보여주기 위해 운영자가 넣은 예시예요.', 'general', NULL, 1792497600000, 1792497600000),
('sample-post-10', 'system:sample', '[예시] 첫 작품을 공개하고 나서 느낀 점', '부족해도 일단 공개하니까 피드백이 생기고, 그게 다음 작품의 원동력이 되더라고요.

이 글은 커뮤니티 화면을 보여주기 위해 운영자가 넣은 예시예요.', 'general', NULL, 1792492200000, 1792492200000);
--> statement-breakpoint
INSERT OR IGNORE INTO `banners` (`id`, `project_id`, `title`, `description`, `button_label`, `button_icon`, `url`, `theme`, `image`, `sort`, `enabled`, `created`, `updated`) VALUES
('banner-sample-art-1', 'sample-art-1', '새벽 정류장', '첫차를 기다리는 사람들의 작은 이야기.
그림·만화 카테고리 예시 배너예요.', '', 'none', '', 'cover', '', 10, 1, 1792540800000, 1792540800000),
('banner-sample-video-1', 'sample-video-1', '30초의 여름', '여름 하루를 30초에 담은 단편 영화.
영상 카테고리 예시 배너예요.', '', 'none', '', 'cover', '', 11, 1, 1792540800000, 1792540800000),
('banner-sample-novel-1', 'sample-novel-1', '별을 줍는 사서', '떨어진 별을 책으로 엮는 도서관 이야기.
소설 카테고리 예시 배너예요.', '', 'none', '', 'cover', '', 12, 1, 1792540800000, 1792540800000);
