CREATE TABLE `banners` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`button_label` text DEFAULT '' NOT NULL,
	`button_icon` text DEFAULT 'none' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`theme` text DEFAULT 'custom' NOT NULL,
	`image` text DEFAULT '' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `banners_sort_idx` ON `banners` (`sort`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`creator` text NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`url` text,
	`image` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`deleted_at` integer,
	`hidden_at` integer,
	`source` text DEFAULT 'community' NOT NULL,
	`subtitle` text DEFAULT '' NOT NULL,
	`art` text DEFAULT 'custom' NOT NULL,
	`badge` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'live' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`featured` integer DEFAULT 0 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_projects`("id", "owner_id", "title", "creator", "type", "description", "url", "image", "created", "deleted_at", "hidden_at") SELECT "id", "owner_id", "title", "creator", "type", "description", "url", "image", "created", "deleted_at", "hidden_at" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_url_unique` ON `projects` (`url`);--> statement-breakpoint
CREATE INDEX `projects_owner_idx` ON `projects` (`owner_id`);--> statement-breakpoint
CREATE INDEX `projects_created_idx` ON `projects` (`created`);