import { pgEnum } from 'drizzle-orm/pg-core';

const roleEnum = pgEnum('role', ['user', 'admin']);

export { roleEnum };