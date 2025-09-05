import { pgTable, serial, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { chatRoomsTable, usersTable, roleEnum } from '../schema.js';

const chatMembersTable = pgTable('chat_members', {
	id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => chatRoomsTable.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  role: roleEnum('role').default('member'), // 'admin', 'member'
  joinedAt: timestamp('joined_at').defaultNow(),
  lastReadAt: timestamp('last_read_at')
}, (table) => ({
  roomUserIdx: index('room_user_idx').on(table.roomId, table.userId),
  userRoomIdx: index('user_room_idx').on(table.userId, table.roomId),
  uniqueRoomUser: uniqueIndex('unique_room_user').on(table.roomId, table.userId)
}));

export { chatMembersTable };