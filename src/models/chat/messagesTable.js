import { pgTable, serial, integer, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { chatRoomsTable, usersTable, messageTypeEnum } from '../schema.js';

const messagesTable = pgTable('messages', {
	id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => chatRoomsTable.id),
  senderId: integer('sender_id').notNull().references(() => usersTable.id),
  content: text('content').notNull(),
  messageType: messageTypeEnum('message_type').default('text'),
  replyToId: integer('reply_to_id').references(() => messagesTable.id),
  isEdited: boolean('is_edited').default(false),
  isDeleted: boolean('is_deleted').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
})

export { messagesTable };