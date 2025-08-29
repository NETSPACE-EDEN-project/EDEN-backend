import { pgEnum } from 'drizzle-orm/pg-core';

const statusEnum = pgEnum('status', ['active', 'inactive', 'deleted']);

export { statusEnum };