CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post` text NOT NULL,
	`visitor` text NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_post_created` ON `comments` (`post`,`created`);--> statement-breakpoint
CREATE INDEX `comments_visitor_created` ON `comments` (`visitor`,`created`);--> statement-breakpoint
CREATE TABLE `hooks` (
	`post` text NOT NULL,
	`visitor` text NOT NULL,
	PRIMARY KEY(`post`, `visitor`)
);
--> statement-breakpoint
CREATE TABLE `views` (
	`post` text NOT NULL,
	`visit` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`post`, `visit`)
);
--> statement-breakpoint
CREATE TABLE `visits` (
	`visit` text PRIMARY KEY NOT NULL,
	`created` integer NOT NULL
);
