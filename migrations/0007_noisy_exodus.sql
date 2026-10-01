CREATE TABLE "mail_authorizations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"state_hash" text NOT NULL,
	"claim_hash" text NOT NULL,
	"verifier" text NOT NULL,
	"code" text,
	"expires_at" timestamp with time zone NOT NULL,
	"callback_at" timestamp with time zone,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mail_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"address" text,
	"tokens" text,
	"lease_key" text,
	"lease_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mail_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"source_address" text NOT NULL,
	"source_id" text NOT NULL,
	"sender" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_outgoing" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"provider" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_authorizations" ADD CONSTRAINT "mail_authorizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_connections" ADD CONSTRAINT "mail_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_imports" ADD CONSTRAINT "mail_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_outgoing" ADD CONSTRAINT "mail_outgoing_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_oauth_state" ON "mail_authorizations" USING btree ("state_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_connection_owner" ON "mail_connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_import_source" ON "mail_imports" USING btree ("user_id","provider","source_address","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_outgoing_request" ON "mail_outgoing" USING btree ("user_id","request_key");