CREATE TABLE "scheduled_workouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"template_id" integer NOT NULL,
	"name" text NOT NULL,
	"origin_day" date NOT NULL,
	"day" date NOT NULL,
	"timezone" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"session_id" integer
);
--> statement-breakpoint
CREATE TABLE "session_feedback" (
	"session_id" integer PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"response" json NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_recommendations" ADD COLUMN "scheduled_id" integer;--> statement-breakpoint
ALTER TABLE "scheduled_workouts" ADD CONSTRAINT "scheduled_workouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_workouts" ADD CONSTRAINT "scheduled_workouts_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_workouts" ADD CONSTRAINT "scheduled_workouts_session_id_completed_workouts_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."completed_workouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_feedback" ADD CONSTRAINT "session_feedback_session_id_completed_workouts_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."completed_workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_feedback" ADD CONSTRAINT "session_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_origin" ON "scheduled_workouts" USING btree ("user_id","template_id","origin_day","timezone");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_session" ON "scheduled_workouts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "scheduled_owner_day" ON "scheduled_workouts" USING btree ("user_id","day");--> statement-breakpoint
ALTER TABLE "coach_recommendations" ADD CONSTRAINT "coach_recommendations_scheduled_id_scheduled_workouts_id_fk" FOREIGN KEY ("scheduled_id") REFERENCES "public"."scheduled_workouts"("id") ON DELETE no action ON UPDATE no action;