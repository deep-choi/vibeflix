ALTER TABLE `projects` ADD `genres` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
-- Starting genres for the curated works (only if an operator has not set them yet)
UPDATE `projects` SET `genres` = '["육성·수집","캐주얼·힐링"]' WHERE `id` = 'koiworld' AND `genres` = '[]';
--> statement-breakpoint
UPDATE `projects` SET `genres` = '["시뮬레이션","복셀","3D"]' WHERE `id` = 'fishing' AND `genres` = '[]';
--> statement-breakpoint
UPDATE `projects` SET `genres` = '["FPS·1인칭","서바이벌","3D"]' WHERE `id` = 'godoftop' AND `genres` = '[]';
--> statement-breakpoint
UPDATE `projects` SET `genres` = '["어드벤처","복셀"]' WHERE `id` = 'voyage' AND `genres` = '[]';
--> statement-breakpoint
UPDATE `projects` SET `genres` = '["생산성","AI"]' WHERE `id` = 'dayflow' AND `genres` = '[]';
--> statement-breakpoint
UPDATE `projects` SET `genres` = '["교육·학습","AI"]' WHERE `id` = 'learnhub' AND `genres` = '[]';
--> statement-breakpoint
UPDATE `projects` SET `genres` = '["포트폴리오"]' WHERE `id` = 'deepchoi' AND `genres` = '[]';
