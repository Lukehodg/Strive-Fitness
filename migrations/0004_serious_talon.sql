CREATE TABLE "coach_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"template_id" integer NOT NULL,
	"request_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"snapshot" json NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_recommendations" ADD CONSTRAINT "coach_recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_request_owner" ON "coach_recommendations" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE INDEX "coach_owner_created" ON "coach_recommendations" USING btree ("user_id","created_at");