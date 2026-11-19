CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`tax_id` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`payment_terms` integer DEFAULT 30 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `accounts_org` ON `accounts` (`org_id`,`name`);--> statement-breakpoint
CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`document_id` text,
	`account_id` text,
	`actor` text NOT NULL,
	`message` text NOT NULL,
	`at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_document` ON `activity` (`org_id`,`document_id`);--> statement-breakpoint
CREATE INDEX `activity_account` ON `activity` (`org_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `companies` (
	`org_id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`tax_id` text DEFAULT '' NOT NULL,
	`company_id` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`bank_details` text DEFAULT '' NOT NULL,
	`footer` text DEFAULT '' NOT NULL,
	`prefixes` text DEFAULT '{}' NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contacts_account` ON `contacts` (`org_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `counters` (
	`org_id` text NOT NULL,
	`type` text NOT NULL,
	`year` integer NOT NULL,
	`last` integer NOT NULL,
	PRIMARY KEY(`org_id`, `type`, `year`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`type` text NOT NULL,
	`account_id` text NOT NULL,
	`number` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`date` text NOT NULL,
	`due_date` text,
	`notes` text DEFAULT '' NOT NULL,
	`supplier_ref` text DEFAULT '' NOT NULL,
	`source_id` text,
	`net_cents` integer DEFAULT 0 NOT NULL,
	`vat_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`share_token` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_org_type` ON `documents` (`org_id`,`type`,`date`);--> statement-breakpoint
CREATE INDEX `documents_account` ON `documents` (`org_id`,`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `documents_share` ON `documents` (`share_token`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`unit` text DEFAULT 'unit' NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`cost_cents` integer DEFAULT 0 NOT NULL,
	`vat_rate` integer DEFAULT 20 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_org_code` ON `items` (`org_id`,`code`);--> statement-breakpoint
CREATE TABLE `lines` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`document_id` text NOT NULL,
	`position` integer NOT NULL,
	`item_id` text,
	`description` text NOT NULL,
	`qty_milli` integer NOT NULL,
	`unit_cents` integer NOT NULL,
	`discount_bp` integer DEFAULT 0 NOT NULL,
	`vat_rate` integer NOT NULL,
	`net_cents` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lines_document` ON `lines` (`document_id`,`position`);--> statement-breakpoint
CREATE TABLE `members` (
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	PRIMARY KEY(`org_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`document_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payments_document` ON `payments` (`org_id`,`document_id`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`document_id` text NOT NULL,
	`sent_to` text NOT NULL,
	`sent_by` text NOT NULL,
	`at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reminders_org` ON `reminders` (`org_id`,`at`);