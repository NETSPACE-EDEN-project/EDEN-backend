import { pgTable, serial, integer, text, varchar } from 'drizzle-orm/pg-core';
import { messagesTable } from '../tables.js';

const messageAttachmentsTable = pgTable('message_attachments', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id').notNull().references(() => messagesTable.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  metadata: text('metadata')
});

export { messageAttachmentsTable };
