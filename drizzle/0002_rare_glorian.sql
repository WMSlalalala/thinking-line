CREATE TABLE `life_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`trip` text NOT NULL,
	`owner` text NOT NULL,
	`object_key` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`caption` text NOT NULL,
	`stop` text,
	`digest` text NOT NULL,
	`status` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `life_photos_trip` ON `life_photos` (`trip`);--> statement-breakpoint
CREATE TABLE `life_trips` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`points` text NOT NULL,
	`states` text NOT NULL,
	`content_hash` text NOT NULL,
	`version` integer NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `life_trips_date` ON `life_trips` (`date`);