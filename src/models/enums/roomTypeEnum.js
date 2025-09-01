import { pgEnum } from 'drizzle-orm/pg-core';

const roomTypeEnum = pgEnum('room_type', ['private', 'group']);

export { roomTypeEnum };