CREATE TABLE `deletion_requests` (
	`user_id` text PRIMARY KEY NOT NULL,
	`requested` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `member_blocks` (
	`owner_id` text NOT NULL,
	`target_id` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `target_id`)
);
--> statement-breakpoint
CREATE TABLE `policy_acceptances` (
	`user_id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`accepted` integer NOT NULL
);
