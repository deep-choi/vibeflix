CREATE TABLE `appeals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`response` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE INDEX `appeals_status_idx` ON `appeals` (`status`,`created`);--> statement-breakpoint
CREATE INDEX `appeals_user_idx` ON `appeals` (`user_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`project_ids` text DEFAULT '[]' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `collections_sort_idx` ON `collections` (`sort`);--> statement-breakpoint
CREATE TABLE `daily_errors` (
	`day` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`last_message` text DEFAULT '' NOT NULL,
	`last_at` integer
);
--> statement-breakpoint
CREATE TABLE `entry_stats` (
	`project_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`day` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`entry_id`, `day`)
);
--> statement-breakpoint
CREATE INDEX `entry_stats_project_idx` ON `entry_stats` (`project_id`);--> statement-breakpoint
CREATE TABLE `sanctions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`until` integer,
	`note` text DEFAULT '' NOT NULL,
	`admin_id` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sanctions_user_idx` ON `sanctions` (`user_id`,`created`);--> statement-breakpoint
CREATE TABLE `search_misses` (
	`day` text NOT NULL,
	`query` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `query`)
);
--> statement-breakpoint
CREATE TABLE `work_referrers` (
	`project_id` text NOT NULL,
	`day` text NOT NULL,
	`source` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`project_id`, `day`, `source`)
);
--> statement-breakpoint
ALTER TABLE `banners` ADD `starts_at` integer;--> statement-breakpoint
ALTER TABLE `banners` ADD `ends_at` integer;--> statement-breakpoint
ALTER TABLE `comments` ADD `status` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `status_entry` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `suspended_until` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `verified_at` integer;--> statement-breakpoint
ALTER TABLE `reports` ADD `category` text DEFAULT 'other' NOT NULL;