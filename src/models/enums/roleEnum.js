import { pgEnum } from 'drizzle-orm/pg-core';

const roleEnum = pgEnum('role', ['user', 'admin', 'member']);

export { roleEnum };