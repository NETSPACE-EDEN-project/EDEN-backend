import { pgTable, serial, integer, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { chatRoomsTable, usersTable } from '../tables.js';
import { messageTypeEnum } from '../../enums/enums.js';

const messagesTable = pgTable('messages', {
	id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => chatRoomsTable.id, { onDelete: 'cascade' }),
  senderId: integer('sender_id').references(() => usersTable.id, { onDelete: 'set null' }),
  content: text('content').notNull(),
  messageType: messageTypeEnum('message_type').default('text'),
  replyToId: integer('reply_to_id').references(() => messagesTable.id, { onDelete: 'set null' }),
  isEdited: boolean('is_edited').default(false),
  isDeleted: boolean('is_deleted').default(false),
  attachmentUrl: text('attachment_url'),
  readBy: text('read_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  roomTimeIdx: index('room_time_idx').on(table.roomId, table.createdAt),
  senderTimeIdx: index('sender_time_idx').on(table.senderId, table.createdAt)
}));

export { messagesTable };