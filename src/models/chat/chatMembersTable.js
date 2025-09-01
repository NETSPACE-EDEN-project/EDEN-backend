import { pgTable, serial, integer, timestamp } from 'drizzle-orm/pg-core';
import { chatRoomsTable, usersTable, roleEnum } from '../schema.js';

const chatMembersTable = pgTable('chat_members', {
	id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => chatRoomsTable.id),
  userId: integer('user_id').notNull().references(() => usersTable.id),
  role: roleEnum('role').default('member'), // 'admin', 'member'
  joinedAt: timestamp('joined_at').defaultNow(),
  lastReadAt: timestamp('last_read_at')
})

export { chatMembersTable };