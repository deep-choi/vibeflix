-- Curated works move from public/catalog.json into the projects table (same ids keep ratings, reactions and comments).
INSERT OR IGNORE INTO `projects` (`id`, `owner_id`, `title`, `creator`, `type`, `description`, `url`, `image`, `created`, `source`, `subtitle`, `art`, `badge`, `status`, `tags`, `featured`, `sort`) VALUES
('koiworld', 'system:catalog', 'Koiworld', 'deepchoi', 'game', '평화로운 연못에서 코이를 키우고, 교배하고, 희귀한 색상과 무늬를 수집하세요. 먹이를 주고 연못을 돌보며 나만의 코이 컬렉션을 만들어가는 캐주얼 육성 게임입니다.', 'https://koigarden.shop/', '/assets/koiworld-cover.png', 7, 'catalog', '나만의 연못에서 시작하는 작은 힐링', 'koiworld', 'CREATOR''S PICK', 'live', '["힐링","수집·육성","교배"]', 1, 0),
('dayflow', 'system:catalog', 'Dayflow', 'deepchoi', 'app', '일정, 할 일, 메모와 AI 대화를 하나의 공간에서 정리하는 개인 생산성 대시보드입니다. 흩어진 생각과 오늘 해야 할 일을 모으고, 나만의 하루를 정리해보세요.', 'https://dayflow.web.app/', '/assets/dayflow-cover.png', 6, 'catalog', '할 일부터 AI 대화까지, 하루를 한곳에', 'dayflow', 'MADE WITH VIBE', 'live', '["생산성","AI","일정 관리"]', 0, 1),
('fishing', 'system:catalog', '네모낚시', 'deepchoi', 'game', '복셀로 만든 저수지에서 즐기는 1인칭 좌대 낚시 게임입니다. 낚싯대와 채비를 고르고, 미끼를 준비하고, 버들못에서 찌를 바라보세요. Google 로그인과 닉네임 설정 후 낚시터에 입장할 수 있습니다.', 'https://voxel-fishing-choi.web.app/', '/assets/fishing-lake.jpg', 5, 'catalog', '물멍부터 대물 파이팅까지, 나만의 좌대', 'fishing', 'PLAY ON WEB', 'live', '["낚시","3D 복셀","시뮬레이션"]', 0, 2),
('learnhub', 'system:catalog', 'LearnHub', 'deepchoi', 'app', '배우고 싶은 주제를 개인 커리큘럼, AI 튜터 수업, 퀴즈와 복습으로 이어가는 맞춤형 학습 서비스입니다. 궁금한 것 하나에서 출발해 학습 기록을 쌓아보세요.', 'https://learnhub-1de94.web.app/', '/assets/learnhub-cover.png', 4, 'catalog', '배우고 싶은 주제, 나만의 커리큘럼으로', 'learnhub', 'MADE WITH VIBE', 'live', '["AI 튜터","학습","복습"]', 0, 3),
('deepchoi', 'system:catalog', 'Deepchoi', 'deepchoi', 'website', 'UI/UX 디자인, 프론트엔드 구현, 바이브 코딩 프로젝트를 정리한 Choi의 포트폴리오입니다. 아이디어가 실제 서비스로 이어지는 과정과 작업을 만나보세요.', 'https://deepchoi.com/', '/assets/deepchoi-cover.png', 3, 'catalog', '아이디어를 경험으로 만드는 크리에이터', 'deepchoi', 'PORTFOLIO', 'live', '["포트폴리오","디자인","바이브 코딩"]', 0, 4),
('godoftop', 'system:catalog', 'GOD OF TOP', 'deepchoi', 'game', 'Three.js로 만든 1인칭 3D 생존 게임 프로토타입입니다. 1층부터 10층까지 올라가며 몬스터를 상대하고, 무기와 스킬로 성장하는 게임을 개발하고 있습니다. 아직 공개 플레이 주소가 준비되지 않았습니다.', NULL, '', 2, 'catalog', '탑의 정점을 향한 1인칭 생존 게임', 'godoftop', 'COMING SOON', 'upcoming', '["3D","서바이벌","개발 중"]', 0, 5),
('voyage', 'system:catalog', 'VOYAGE', 'deepchoi', 'game', '블록 스타일의 1인칭 여행 게임 프로토타입입니다. 9개국 19개 관광지의 분위기를 담은 공간을 걸어 다니는 여행을 준비하고 있습니다. 아직 공개 플레이 주소가 준비되지 않았습니다.', NULL, '/assets/mountain.jpg', 1, 'catalog', '블록으로 만나는 세상, 발걸음으로 남기는 여행', 'voyage', 'COMING SOON', 'upcoming', '["여행","복셀","개발 중"]', 0, 6);
--> statement-breakpoint
-- The three hero slides that used to be hard-coded in public/app.js.
INSERT OR IGNORE INTO `banners` (`id`, `project_id`, `title`, `description`, `button_label`, `button_icon`, `url`, `theme`, `image`, `sort`, `enabled`, `created`, `updated`) VALUES
('banner-koiworld', 'koiworld', '코이월드', '어떤 무늬의 코이가 태어날까요?
키우고, 교배하고, 수집하는 나만의 작은 힐링.', '지금 플레이', 'play', 'https://koigarden.shop/', 'koi', '/assets/koi-icon.png', 0, 1, 1792540800000, 1792540800000),
('banner-fishing', 'fishing', '네모낚시', '블록으로 만든 저수지에서 즐기는 좌대 낚시.
채비를 고르고, 찌를 바라보고, 대물을 만나보세요.', '지금 플레이', 'play', 'https://voxel-fishing-choi.web.app/', 'fishing', '/assets/fishing-lake.jpg', 1, 1, 1792540800000, 1792540800000),
('banner-dayflow', 'dayflow', 'Dayflow', '일정, 할 일, 메모, 그리고 AI와의 대화.
복잡한 하루를 나만의 속도로 정리하는 공간.', '서비스 바로가기 ↗', 'none', 'https://dayflow.web.app/', 'dayflow', '/assets/dayflow-screen.jpg', 2, 1, 1792540800000, 1792540800000);
