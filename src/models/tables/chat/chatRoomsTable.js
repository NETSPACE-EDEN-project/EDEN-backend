import { pgTable, serial, varchar, text, boolean, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { statusEnum, roomTypeEnum } from '../../enums/enums.js';
import { usersTable } from '../tables.js';

const chatRoomsTable = pgTable('chat_rooms', {
	id: serial('id').primaryKey(),
	roomName: varchar('name', { length: 100 }),
	description: text('description'),
	roomType: roomTypeEnum('room_type').notNull().default('group'),
	createdBy: integer('created_by').notNull().references(() => usersTable.id, { onDelete: 'set null' }),
	status: statusEnum('status').notNull().default('active'),
	maxMembers: integer('max_members').default(100),
  isPrivate: boolean('is_private').default(false),
  lastMessageAt: timestamp('last_message_at'),
	createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  statusIdx: index('status_idx').on(table.status),
  typeIdx: index('type_idx').on(table.roomType),
  createdByIdx: index('created_by_idx').on(table.createdBy)
}));

export { chatRoomsTable };