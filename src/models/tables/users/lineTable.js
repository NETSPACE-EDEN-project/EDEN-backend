import { pgTable, serial, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { usersTable } from '../tables.js';

const lineTable = pgTable('line_users', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').notNull().references(() => usersTable.id),
  lineUserId: varchar("line_user_id", { length: 255 }).unique(),
  lineDisplayName: varchar("line_display_name", { length: 255 }),
  linePictureUrl: text("line_picture_url"),
  lineStatusMessage: text("line_status_message"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow()
});

export { lineTable };