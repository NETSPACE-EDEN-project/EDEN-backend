CREATE TYPE "public"."message_type" AS ENUM('text', 'image', 'file');--> statement-breakpoint
CREATE TYPE "public"."provider_type" AS ENUM('email', 'google', 'line', 'facebook', 'github');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin', 'member', 'superadmin', 'moderator');--> statement-breakpoint
CREATE TYPE "public"."room_type" AS ENUM('private', 'group');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('active', 'inactive', 'deleted');--> statement-breakpoint
CREATE TABLE "chat_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" "role" DEFAULT 'member',
	"joined_at" timestamp DEFAULT now(),
	"last_read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "chat_rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100),
	"description" text,
	"room_type" "room_type" DEFAULT 'group' NOT NULL,
	"created_by" integer NOT NULL,
	"status" "status" DEFAULT 'active' NOT NULL,
	"max_members" integer DEFAULT 100,
	"is_private" boolean DEFAULT false,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"email" varchar(100) NOT NULL,
	"password" varchar(100) NOT NULL,
	"is_verified_email" boolean DEFAULT false,
	"email_verification_token" varchar(255),
	"email_verification_expires" timestamp,
	"last_verification_email_sent" timestamp,
	"password_reset_token" varchar(255),
	"password_reset_expires" timestamp,
	"last_password_reset_sent" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "email_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "line_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"line_user_id" varchar(255),
	"line_display_name" varchar(255),
	"line_picture_url" text,
	"line_status_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "line_users_line_user_id_unique" UNIQUE("line_user_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"sender_id" integer,
	"content" text NOT NULL,
	"message_type" "message_type" DEFAULT 'text',
	"reply_to_id" integer,
	"is_edited" boolean DEFAULT false,
	"is_deleted" boolean DEFAULT false,
	"attachment_url" text,
	"read_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"phone" varchar(20),
	"birthday" date,
	"avatar_url" varchar(255),
	"role" "role" DEFAULT 'user' NOT NULL,
	"provider_type" "provider_type" NOT NULL,
	"status" "status" NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_users" ADD CONSTRAINT "email_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_users" ADD CONSTRAINT "line_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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