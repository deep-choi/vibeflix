CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`creator` text NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`url` text NOT NULL,
	`image` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_url_unique` ON `projects` (`url`);--> statement-breakpoint
CREATE INDEX `projects_owner_idx` ON `projects` (`owner_id`);--> statement-breakpoint
CREATE INDEX `projects_created_idx` ON `projects` (`created`);