-- Sample banners open the in-site sample viewer (/samples/:id) instead of having no button.
UPDATE `banners` SET `url` = '/samples/sample-art-1', `button_label` = '예시 작품 보기', `button_icon` = 'none' WHERE `id` = 'banner-sample-art-1' AND `url` = '';
--> statement-breakpoint
UPDATE `banners` SET `url` = '/samples/sample-video-1', `button_label` = '예시 영상 보기', `button_icon` = 'play' WHERE `id` = 'banner-sample-video-1' AND `url` = '';
--> statement-breakpoint
UPDATE `banners` SET `url` = '/samples/sample-novel-1', `button_label` = '예시 1화 읽기', `button_icon` = 'none' WHERE `id` = 'banner-sample-novel-1' AND `url` = '';
