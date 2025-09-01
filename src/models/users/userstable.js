import { pgTable, serial, varchar, date, timestamp } from 'drizzle-orm/pg-core';
import { providerTypeEnum, roleEnum, statusEnum } from '../schema.js';

const usersTable = pgTable('users', {
	id: serial('id').primaryKey(),
	username: varchar({ length: 100 }).notNull(),
	phone: varchar('phone', { length: 20 }),
	birthday: date('birthday'),
	avatarUrl: varchar('avatar_url', { length: 255 }),
	role: roleEnum('role').notNull().default('user'),
	providerType: providerTypeEnum("provider_type").notNull(),
  status: statusEnum("status").notNull(),
	createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export { usersTable };