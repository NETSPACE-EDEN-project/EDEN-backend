import { pgTable, serial, integer, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';
import { usersTable } from '../tables.js';

const emailTable = pgTable('email_users', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').notNull().references(() => usersTable.id),
	email: varchar({ length: 100 }).notNull().unique(),
	password: varchar({ length: 100 }).notNull(),
	isVerifiedEmail: boolean('is_verified_email').default(false),
	emailVerificationToken: varchar('email_verification_token', { length: 255 }),
	emailVerificationExpires: timestamp('email_verification_expires', { withTimezone: true }),
	lastVerificationEmailSent: timestamp('last_verification_email_sent', { withTimezone: true }),
	passwordResetToken: varchar('password_reset_token', { length: 255 }),
	passwordResetExpires: timestamp('password_reset_expires', { withTimezone: true }),
	lastPasswordResetSent: timestamp('last_password_reset_sent', { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

export { emailTable };