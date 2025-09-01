import { pgEnum } from 'drizzle-orm/pg-core';

const messageTypeEnum = pgEnum('message_type', ['text', 'image', 'file']);

export { messageTypeEnum };