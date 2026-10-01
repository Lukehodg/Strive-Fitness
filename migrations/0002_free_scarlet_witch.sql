CREATE TABLE "routine_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"medication_id" integer NOT NULL,
	"name" text NOT NULL,
	"dosage" text NOT NULL,
	"status" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_key" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "completed_workouts" ADD COLUMN "plan_snapshot" json;--> statement-breakpoint
ALTER TABLE "medications" ADD COLUMN "category" text DEFAULT 'medication' NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD COLUMN "creation_key" text;--> statement-breakpoint
ALTER TABLE "routine_logs" ADD CONSTRAINT "routine_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_logs" ADD CONSTRAINT "routine_logs_medication_id_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "routine_log_request" ON "routine_logs" USING btree ("user_id","request_key");