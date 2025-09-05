ALTER TABLE "chat_members" DROP CONSTRAINT "chat_members_room_id_chat_rooms_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_members" DROP CONSTRAINT "chat_members_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_rooms" DROP CONSTRAINT "chat_rooms_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_room_id_chat_rooms_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_sender_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_reply_to_id_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "sender_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "max_members" integer DEFAULT 100;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "is_private" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "last_message_at" timestamp;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "attachment_url" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "read_by" text;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_user_idx" ON "chat_members" USING btree ("room_id","user_id");--> statement-breakpoint
CREATE INDEX "user_room_idx" ON "chat_members" USING btree ("user_id","room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_room_user" ON "chat_members" USING btree ("room_id","user_id");--> statement-breakpoint
CREATE INDEX "status_idx" ON "chat_rooms" USING btree ("status");--> statement-breakpoint
CREATE INDEX "type_idx" ON "chat_rooms" USING btree ("room_type");--> statement-breakpoint
CREATE INDEX "created_by_idx" ON "chat_rooms" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "room_time_idx" ON "messages" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "sender_time_idx" ON "messages" USING btree ("sender_id","created_at");