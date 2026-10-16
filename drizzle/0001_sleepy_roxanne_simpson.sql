CREATE TABLE `bookmarks` (
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`user_id`, `project_id`)
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`parent_id` text,
	`body` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`deleted_at` integer,
	`hidden_at` integer
);
--> statement-breakpoint
CREATE INDEX `comments_target_idx` ON `comments` (`target_kind`,`target_id`,`created`);--> statement-breakpoint
CREATE INDEX `comments_owner_idx` ON `comments` (`owner_id`);--> statement-breakpoint
CREATE TABLE `limits` (
	`id` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`kind` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`excerpt` text NOT NULL,
	`created` integer NOT NULL,
	`read_at` integer
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_idx` ON `notifications` (`recipient_id`,`created`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`project_id` text,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`deleted_at` integer,
	`hidden_at` integer
);
--> statement-breakpoint
CREATE INDEX `posts_created_idx` ON `posts` (`created`);--> statement-breakpoint
CREATE INDEX `posts_owner_idx` ON `posts` (`owner_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`name` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`avatar` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`suspended` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_public_id_unique` ON `profiles` (`public_id`);--> statement-breakpoint
CREATE TABLE `ratings` (
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`score` integer NOT NULL,
	`review` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`user_id`, `project_id`),
	CONSTRAINT "ratings_score_check" CHECK("ratings"."score" between 1 and 5)
);
--> statement-breakpoint
CREATE INDEX `ratings_project_idx` ON `ratings` (`project_id`);--> statement-breakpoint
CREATE TABLE `reactions` (
	`user_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`user_id`, `target_kind`, `target_id`)
);
--> statement-breakpoint
CREATE INDEX `reactions_target_idx` ON `reactions` (`target_kind`,`target_id`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `reports` (`status`,`created`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expiry_idx` ON `sessions` (`expires`);