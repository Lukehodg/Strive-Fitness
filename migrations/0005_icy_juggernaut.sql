CREATE TABLE "coach_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"recommendation_id" integer NOT NULL,
	"choice" text NOT NULL,
	"plan" json NOT NULL,
	"session_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_decisions" ADD CONSTRAINT "coach_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_decisions" ADD CONSTRAINT "coach_decisions_recommendation_id_coach_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."coach_recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_decisions" ADD CONSTRAINT "coach_decisions_session_id_completed_workouts_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."completed_workouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_decision_recommendation" ON "coach_decisions" USING btree ("recommendation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coach_decision_session" ON "coach_decisions" USING btree ("session_id");