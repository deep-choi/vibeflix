ALTER TABLE `projects` ADD `content` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `details` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Starting details for curated works
UPDATE `projects` SET `details` = '{"playMode":"browser"}' WHERE `id` IN ('koiworld','fishing') AND `details` = '{}';
--> statement-breakpoint
UPDATE `projects` SET `details` = '{"platforms":["web"]}' WHERE `id` IN ('dayflow','learnhub') AND `details` = '{}';
--> statement-breakpoint
UPDATE `projects` SET `details` = '{"format":"illustration"}' WHERE `id` IN ('sample-art-1','sample-art-3','sample-art-4') AND `details` = '{}';
--> statement-breakpoint
UPDATE `projects` SET `details` = '{"format":"webtoon"}' WHERE `id` = 'sample-art-2' AND `details` = '{}';
--> statement-breakpoint
UPDATE `projects` SET `details` = '{"duration":"0:30"}' WHERE `id` LIKE 'sample-video-%' AND `details` = '{}';
--> statement-breakpoint
UPDATE `projects` SET `details` = '{"status":"ongoing"}' WHERE `id` LIKE 'sample-novel-%' AND `details` = '{}';
--> statement-breakpoint
-- Sample banners now open the unified work page
UPDATE `banners` SET `url` = REPLACE(`url`, '/samples/', '/works/') WHERE `url` LIKE '/samples/%';
