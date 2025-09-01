import { pgTable, serial, varchar, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { usersTable, statusEnum, roomTypeEnum } from '../schema.js';

const chatRoomsTable = pgTable('chat_rooms', {
	id: serial('id').primaryKey(),
	roomName: varchar('name', { length: 100 }),
	description: text('description'),
	roomType: roomTypeEnum('room_type').notNull().default('group'),
	createdBy: integer('created_by').notNull().references(() => usersTable.id),
	status: statusEnum('status').notNull().default('active'),
	createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export { chatRoomsTable };