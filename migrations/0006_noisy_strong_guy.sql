ALTER TABLE "meals" ADD COLUMN "creation_key" text;--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN "creation_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "meal_creation_owner" ON "meals" USING btree ("user_id","creation_key");