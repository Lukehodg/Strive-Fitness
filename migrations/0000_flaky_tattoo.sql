CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"date" timestamp with time zone NOT NULL,
	"is_completed" boolean DEFAULT false,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "completed_workouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"workout_template_id" integer NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"is_completed" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"calories_consumed" integer DEFAULT 0,
	"calories_burned" integer DEFAULT 0,
	"protein_consumed" real DEFAULT 0,
	"carbs_consumed" real DEFAULT 0,
	"fat_consumed" real DEFAULT 0,
	"steps_count" integer DEFAULT 0,
	"water_intake" real DEFAULT 0,
	"weight_measurement" real
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"muscle_group" text NOT NULL,
	"description" text,
	"measurement_type" text DEFAULT 'weight_reps',
	"default_target" json,
	"is_endurance" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "health_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"metric_type" text NOT NULL,
	"value" real,
	"systolic" integer,
	"diastolic" integer,
	"notes" text,
	"tags" json
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"calories" integer NOT NULL,
	"protein" real NOT NULL,
	"carbs" real NOT NULL,
	"fat" real NOT NULL,
	"foods" json NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"medication_id" integer NOT NULL,
	"scheduled_time" timestamp with time zone NOT NULL,
	"taken_time" timestamp with time zone,
	"is_taken" boolean DEFAULT false,
	"skipped" boolean DEFAULT false,
	"notes" text,
	"injection_site" text
);
--> statement-breakpoint
CREATE TABLE "medications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"dosage" text NOT NULL,
	"frequency" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"notes" text,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"price" real NOT NULL,
	"billing_cycle" text NOT NULL,
	"features" json NOT NULL,
	"stripe_price_id" text,
	"is_active" boolean DEFAULT true,
	"max_workout_templates" integer,
	"max_health_metrics" integer,
	"max_medications" integer,
	"allows_analytics" boolean DEFAULT false,
	"allows_health_integrations" boolean DEFAULT false,
	"allows_custom_workouts" boolean DEFAULT false,
	"allows_pdf_upload" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "subscription_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"subscription_plan_id" integer NOT NULL,
	"amount" real NOT NULL,
	"status" text NOT NULL,
	"transaction_date" timestamp with time zone DEFAULT now() NOT NULL,
	"payment_method" text,
	"stripe_payment_intent_id" text,
	"receipt_url" text,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"password" text NOT NULL,
	"display_name" text NOT NULL,
	"height" real,
	"weight" real,
	"body_fat" real,
	"daily_calorie_target" integer,
	"daily_step_target" integer,
	"daily_protein_target" integer,
	"daily_carbs_target" integer,
	"daily_fat_target" integer,
	"profile_type" text DEFAULT 'standard',
	"dashboard_widgets" json,
	"subscription_plan" text DEFAULT 'free' NOT NULL,
	"subscription_expiry" timestamp with time zone,
	"stripe_customer_id" text,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "workout_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"completed_workout_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"weight" real,
	"reps" integer,
	"rpe" integer,
	"set_number" integer NOT NULL,
	"set_type" text DEFAULT 'working' NOT NULL,
	"is_completed" boolean DEFAULT false,
	"timestamp" timestamp with time zone NOT NULL,
	"distance" real,
	"duration" integer,
	"pace" real,
	"calories" integer,
	"heart_rate" integer,
	"laps" integer,
	"notes" text,
	"perceived_effort" integer,
	"elevation_gain" real,
	"measurement_type" text DEFAULT 'weight_reps',
	"metric_value" json
);
--> statement-breakpoint
CREATE TABLE "workout_template_exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"workout_template_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"sets" integer NOT NULL,
	"reps_min" integer NOT NULL,
	"reps_max" integer NOT NULL,
	"rest_seconds" integer,
	"order" integer NOT NULL,
	"distance" real,
	"duration" integer,
	"target_type" text DEFAULT 'reps',
	"target_value" real,
	"intervals" integer,
	"work_to_rest_ratio" text
);
--> statement-breakpoint
CREATE TABLE "workout_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"exercise_count" integer NOT NULL,
	"duration" integer NOT NULL,
	"color" text DEFAULT '#3F51B5',
	"scheduled_day" text,
	"description" text,
	"workout_type" text DEFAULT 'traditional',
	"target_time_in_minutes" integer,
	"rounds" integer,
	"is_reversed" boolean DEFAULT false
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completed_workouts" ADD CONSTRAINT "completed_workouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completed_workouts" ADD CONSTRAINT "completed_workouts_workout_template_id_workout_templates_id_fk" FOREIGN KEY ("workout_template_id") REFERENCES "public"."workout_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_stats" ADD CONSTRAINT "daily_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_metrics" ADD CONSTRAINT "health_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_schedule" ADD CONSTRAINT "medication_schedule_medication_id_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_transactions" ADD CONSTRAINT "subscription_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_completed_workout_id_completed_workouts_id_fk" FOREIGN KEY ("completed_workout_id") REFERENCES "public"."completed_workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_template_exercises" ADD CONSTRAINT "workout_template_exercises_workout_template_id_workout_templates_id_fk" FOREIGN KEY ("workout_template_id") REFERENCES "public"."workout_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_template_exercises" ADD CONSTRAINT "workout_template_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_expiry" ON "sessions" USING btree ("expires_at");