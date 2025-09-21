import { pgTable, serial, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { messagesTable, usersTable } from '../tables.js';

const messageReadsTable = pgTable('message_reads', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id').notNull().references(() => messagesTable.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  readAt: timestamp('read_at', { withTimezone: true }).defaultNow()
}, (table) => ({
  uniqueRead: uniqueIndex('unique_read').on(table.messageId, table.userId),
  messageIdx: index('message_idx').on(table.messageId),
  userIdx: index('user_idx').on(table.userId)
}));

export { messageReadsTable };
