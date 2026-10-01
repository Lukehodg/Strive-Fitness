CREATE TABLE "daily_check_ins" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"energy" text NOT NULL,
	"soreness" text NOT NULL,
	"limited" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_check_ins" ADD CONSTRAINT "daily_check_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "check_in_user_day" ON "daily_check_ins" USING btree ("user_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_stats_user_date" ON "daily_stats" USING btree ("user_id","date");