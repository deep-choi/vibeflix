CREATE TABLE `admin_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`action` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_actions_created_idx` ON `admin_actions` (`created`);--> statement-breakpoint
CREATE TABLE `daily_views` (
	`day` text PRIMARY KEY NOT NULL,
	`views` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_visitors` (
	`day` text NOT NULL,
	`visitor` text NOT NULL,
	PRIMARY KEY(`day`, `visitor`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated` integer NOT NULL
);
