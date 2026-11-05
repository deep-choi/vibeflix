CREATE TABLE `view_dedupe` (
	`day` text NOT NULL,
	`key` text NOT NULL,
	`visitor` text NOT NULL,
	PRIMARY KEY(`day`, `key`, `visitor`)
);
--> statement-breakpoint
CREATE INDEX `admin_actions_target_idx` ON `admin_actions` (`target_id`);--> statement-breakpoint
CREATE INDEX `bookmarks_project_idx` ON `bookmarks` (`project_id`);--> statement-breakpoint
CREATE INDEX `posts_category_idx` ON `posts` (`category`,`created`);--> statement-breakpoint
CREATE INDEX `reports_target_idx` ON `reports` (`target_kind`,`target_id`,`status`);--> statement-breakpoint
CREATE INDEX `work_stats_day_idx` ON `work_stats` (`day`);