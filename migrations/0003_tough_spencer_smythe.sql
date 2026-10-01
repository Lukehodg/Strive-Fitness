CREATE TABLE "wearable_authorizations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"state_hash" text NOT NULL,
	"claim_hash" text NOT NULL,
	"verifier" text,
	"code" text,
	"expires_at" timestamp with time zone NOT NULL,
	"callback_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wearable_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"subject" text,
	"credentials" text,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"next_sync_at" timestamp with time zone,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"lease_id" text,
	"lease_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wearable_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"day" date NOT NULL,
	"source_id" text NOT NULL,
	"score" real,
	"sleep_minutes" real,
	"hrv" real,
	"calibrating" boolean DEFAULT false NOT NULL,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wearable_authorizations" ADD CONSTRAINT "wearable_authorizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wearable_connections" ADD CONSTRAINT "wearable_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wearable_days" ADD CONSTRAINT "wearable_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wearable_oauth_state" ON "wearable_authorizations" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "wearable_oauth_expiry" ON "wearable_authorizations" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wearable_user_provider" ON "wearable_connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "wearable_sync_due" ON "wearable_connections" USING btree ("next_sync_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wearable_day_source" ON "wearable_days" USING btree ("user_id","provider","day");