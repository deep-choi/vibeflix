ALTER TABLE `posts` ADD `solved_comment` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `links` text DEFAULT '[]' NOT NULL;