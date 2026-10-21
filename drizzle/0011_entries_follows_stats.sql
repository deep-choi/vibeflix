CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`number` integer,
	`version` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`published_at` integer NOT NULL,
	`notified_at` integer,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entries_project_idx` ON `entries` (`project_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `follows` (
	`follower_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`follower_id`, `creator_id`)
);
--> statement-breakpoint
CREATE INDEX `follows_creator_idx` ON `follows` (`creator_id`);--> statement-breakpoint
CREATE TABLE `work_stats` (
	`project_id` text NOT NULL,
	`day` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`project_id`, `day`)
);
--> statement-breakpoint
ALTER TABLE `comments` ADD `label` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `project_images` ADD `entry_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `visibility` text DEFAULT 'public' NOT NULL;